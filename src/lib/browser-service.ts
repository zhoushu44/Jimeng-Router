import { chromium, Browser, BrowserContext, Page, Route } from "playwright-core";
import logger from "@/lib/logger.ts";
import { getCookiesForBrowser, getCookiesForBrowserInternational } from "@/api/controllers/core.ts";

// bdms SDK 相关脚本的白名单域名
const SCRIPT_WHITELIST_DOMAINS = [
  "vlabstatic.com",
  "bytescm.com",
  "jianying.com",
  "byteimg.com",
  "capcutstatic.com",
  "capcut.com",
  "bytegecko.com",
  "bytedance.com",
  "bytegoofy.com",
  "ttwstatic.com",
];

// 需要屏蔽的资源类型（加速加载、减少内存）
const BLOCKED_RESOURCE_TYPES = ["image", "font", "stylesheet", "media"];

// 会话空闲超时时间（毫秒）
const SESSION_IDLE_TIMEOUT = 10 * 60 * 1000;

// bdms SDK 就绪等待超时（毫秒）
const BDMS_READY_TIMEOUT = 30000;

// 国际版 API 域名映射（前端域名 → 实际 API 域名）
const INTERNATIONAL_API_HOST_MAP: Record<string, string> = {
  "dreamina.capcut.com": "mweb-api-sg.capcut.com",
  "dreamina.us.capcut.com": "dreamina-api.us.capcut.com",
};

interface BrowserSession {
  context: BrowserContext;
  page: Page;
  lastUsed: number;
  idleTimer: NodeJS.Timeout | null;
  region?: "cn" | "international"; // 区域标识
}

interface BrowserPageDiagnostics {
  url: string;
  readyState: string;
  title: string;
  fetchHooked: boolean;
  hasBdms: boolean;
  hasSecsdk: boolean;
  hasBytedAcrawler: boolean;
}

class BrowserService {
  private browser: Browser | null = null;
  private sessions: Map<string, BrowserSession> = new Map();
  private launching: Promise<Browser> | null = null;
  private sessionCreations: Map<string, Promise<BrowserSession>> = new Map();

  /**
   * 懒启动浏览器实例
   */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // 防止并发启动
    if (this.launching) {
      return this.launching;
    }

    this.launching = (async () => {
      logger.info("BrowserService: 正在启动 Chromium 浏览器...");
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-zygote",
          ],
        });

        this.browser.on("disconnected", () => {
          logger.warn("BrowserService: 浏览器已断开连接");
          this.browser = null;
          for (const session of this.sessions.values()) {
            if (session.idleTimer) {
              clearTimeout(session.idleTimer);
            }
          }
          this.sessions.clear();
        });

        logger.info("BrowserService: Chromium 浏览器启动成功");
        return this.browser;
      } finally {
        this.launching = null;
      }
    })();

    return this.launching;
  }

  private isSessionValid(session: BrowserSession | undefined | null): session is BrowserSession {
    if (!session) {
      return false;
    }

    if (!this.browser?.isConnected()) {
      return false;
    }

    if (session.page.isClosed()) {
      return false;
    }

    try {
      return !!session.page.context();
    } catch {
      return false;
    }
  }

  private refreshSessionTimer(sessionKey: string, session: BrowserSession) {
    session.lastUsed = Date.now();
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }
    session.idleTimer = setTimeout(() => this.closeSession(sessionKey), SESSION_IDLE_TIMEOUT);
  }

  private async collectPageDiagnostics(page: Page): Promise<BrowserPageDiagnostics> {
    try {
      return await page.evaluate(() => ({
        url: window.location.href,
        readyState: document.readyState,
        title: document.title,
        fetchHooked: window.fetch.toString().indexOf("native code") === -1,
        hasBdms: !!(window as any).bdms,
        hasSecsdk: !!(window as any).__secsdk,
        hasBytedAcrawler: !!(window as any).byted_acrawler,
      }));
    } catch {
      return {
        url: page.url(),
        readyState: "unknown",
        title: "",
        fetchHooked: false,
        hasBdms: false,
        hasSecsdk: false,
        hasBytedAcrawler: false,
      };
    }
  }

  /**
   * 获取或创建指定 token 的浏览器会话
   * @param token raw sessionid (不含前缀)
   * @param region "cn" 或 "international"
   */
  async getSession(token: string, region: "cn" | "international" = "cn"): Promise<BrowserSession> {
    const sessionKey = `${region}:${token}`;
    const existing = this.sessions.get(sessionKey);
    if (this.isSessionValid(existing)) {
      this.refreshSessionTimer(sessionKey, existing);
      return existing;
    }

    if (existing) {
      logger.warn(`BrowserService: 检测到失效会话，准备重建 ${sessionKey.substring(0, 16)}...`);
      await this.closeSession(sessionKey);
    }

    const inflight = this.sessionCreations.get(sessionKey);
    if (inflight) {
      return inflight;
    }

    const creation = this.createSession(token, region);
    this.sessionCreations.set(sessionKey, creation);

    try {
      return await creation;
    } finally {
      this.sessionCreations.delete(sessionKey);
    }
  }

  /**
   * 国际版 API 请求路由重写
   * 浏览器页面在 dreamina.capcut.com，但 API 在 mweb-api-sg.capcut.com
   * secsdk 要求同源才能正确签名，所以将同源请求代理转发到实际 API
   */
  private async setupInternationalApiRoute(page: Page) {
    await page.route("**/mweb/**", async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());

      // 查找对应的实际 API 域名
      const apiHost = INTERNATIONAL_API_HOST_MAP[url.hostname];
      if (!apiHost) {
        return route.continue();
      }

      // 重写 URL 为实际 API 域名
      const targetUrl = `${url.protocol}//${apiHost}${url.pathname}${url.search}`;
      logger.info(`BrowserService: API 路由重写 ${request.url().substring(0, 80)} → ${targetUrl.substring(0, 80)}`);
      // 调试: 打印完整的 URL 查询参数和请求头
      logger.info(`BrowserService: [DEBUG] 完整URL: ${request.url()}`);
      const headers = request.headers();
      const headerKeys = Object.keys(headers).filter(k => !['accept', 'accept-language', 'user-agent', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'origin', 'referer'].includes(k));
      logger.info(`BrowserService: [DEBUG] 特殊请求头: ${JSON.stringify(headerKeys.reduce((acc, k) => ({ ...acc, [k]: headers[k] }), {}))}`);
      logger.info(`BrowserService: [DEBUG] 查询参数: ${url.search}`);

      try {
        const response = await route.fetch({ url: targetUrl });
        await route.fulfill({ response });
      } catch (err) {
        logger.error(`BrowserService: API 路由重写失败: ${(err as Error).message}`);
        await route.abort();
      }
    });
  }

  /**
   * 创建新的浏览器会话
   */
  private async createSession(token: string, region: "cn" | "international" = "cn"): Promise<BrowserSession> {
    const browser = await this.ensureBrowser();
    const sessionKey = `${region}:${token}`;

    logger.info(`BrowserService: 为 token ${token.substring(0, 8)}... (${region}) 创建新会话`);

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: region === "international" ? "en-US" : "zh-CN",
    });

    if (region === "international") {
      await context.setExtraHTTPHeaders({
        "x-requested-with": "XMLHttpRequest",
        "loc": "en",
      });
    }

    // 注入 cookies（根据区域使用不同域名和 cookies）
    const cookies = region === "international"
      ? getCookiesForBrowserInternational(token)
      : getCookiesForBrowser(token);
    await context.addCookies(cookies);

    // 配置资源拦截
    await context.route("**/*", (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      // 屏蔽不需要的资源类型
      if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
        return route.abort();
      }

      // 对于脚本资源，只允许白名单域名
      if (resourceType === "script") {
        const isWhitelisted = SCRIPT_WHITELIST_DOMAINS.some((domain) =>
          url.includes(domain)
        );
        if (!isWhitelisted) {
          logger.info(`BrowserService: [SCRIPT] 屏蔽脚本: ${url.substring(0, 150)}`);
          return route.abort();
        }
      }

      return route.continue();
    });

    const page = await context.newPage();

    page.on("close", () => {
      logger.warn(`BrowserService: 页面已关闭，清理会话 ${sessionKey.substring(0, 16)}...`);
      const current = this.sessions.get(sessionKey);
      if (current?.page === page) {
        if (current.idleTimer) {
          clearTimeout(current.idleTimer);
        }
        this.sessions.delete(sessionKey);
      }
    });

    context.on("close", () => {
      logger.warn(`BrowserService: 上下文已关闭，清理会话 ${sessionKey.substring(0, 16)}...`);
      const current = this.sessions.get(sessionKey);
      if (current?.context === context) {
        if (current.idleTimer) {
          clearTimeout(current.idleTimer);
        }
        this.sessions.delete(sessionKey);
      }
    });

    // 国际版：设置 API 路由重写（必须在 context route 之后注册，page route 优先）
    if (region === "international") {
      await this.setupInternationalApiRoute(page);
    }

    // 根据区域导航到不同页面，让 bdms SDK 加载
    const navUrl = region === "international"
      ? "https://dreamina.capcut.com/ai-tool/video/generate"
      : "https://jimeng.jianying.com/ai-tool/video/generate";
    logger.info(`BrowserService: 正在导航到 ${navUrl} ...`);
    try {
      await page.goto(navUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (err) {
      const message = (err as Error).message;
      logger.error(`BrowserService: 页面导航失败: ${message}`);
      try {
        await context.close();
      } catch {}
      throw new Error(`浏览器页面初始化失败: ${message}`);
    }

    // 等待安全 SDK 就绪
    const sdkName = region === "international" ? "secsdk" : "bdms";
    logger.info(`BrowserService: 等待 ${sdkName} SDK 就绪...`);
    try {
      if (region === "international") {
        // 国际版使用 secsdk（会注入签名到 fetch 请求头）
        await page.waitForFunction(
          () => {
            // secsdk 会在 window 上挂载 __secsdk 或替换 fetch
            return (
              (window as any).__secsdk ||
              (window as any).__ac_nonce ||
              (window as any).byted_acrawler ||
              // secsdk 会修改 fetch，注入签名 headers
              window.fetch.toString().indexOf("native code") === -1
            );
          },
          { timeout: BDMS_READY_TIMEOUT }
        );
        // 国际版额外等待并触发页面交互，确保 secsdk 完全激活
        logger.info(`BrowserService: secsdk 检测到，触发页面交互以激活签名...`);
        // 模拟用户交互，触发 secsdk 初始化
        await page.mouse.move(100, 100);
        await page.mouse.click(100, 100);
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // 国内版使用 bdms SDK
        await page.waitForFunction(
          () => {
            return (
              (window as any).bdms?.init ||
              (window as any).byted_acrawler ||
              window.fetch.toString().indexOf("native code") === -1
            );
          },
          { timeout: BDMS_READY_TIMEOUT }
        );
      }
      logger.info(`BrowserService: ${sdkName} SDK 已就绪`);
      const diagnostics = await this.collectPageDiagnostics(page);
      logger.info(`BrowserService: 页面诊断 url=${diagnostics.url.substring(0, 160)}, readyState=${diagnostics.readyState}, fetchHooked=${diagnostics.fetchHooked}, bdms=${diagnostics.hasBdms}, secsdk=${diagnostics.hasSecsdk}, acrawler=${diagnostics.hasBytedAcrawler}`);
    } catch (err) {
      logger.warn(
        `BrowserService: ${sdkName} SDK 等待超时，可能未完全加载，继续尝试...`
      );
      const diagnostics = await this.collectPageDiagnostics(page);
      logger.warn(`BrowserService: SDK 超时后的页面诊断 url=${diagnostics.url.substring(0, 160)}, readyState=${diagnostics.readyState}, fetchHooked=${diagnostics.fetchHooked}, bdms=${diagnostics.hasBdms}, secsdk=${diagnostics.hasSecsdk}, acrawler=${diagnostics.hasBytedAcrawler}`);
    }

    const session: BrowserSession = {
      context,
      page,
      lastUsed: Date.now(),
      idleTimer: null,
      region,
    };

    this.refreshSessionTimer(sessionKey, session);
    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * 关闭指定 token 的会话
   */
  private async closeSession(token: string) {
    const session = this.sessions.get(token);
    if (!session) return;

    logger.info(`BrowserService: 关闭空闲会话 ${token.substring(0, 8)}...`);
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }

    this.sessions.delete(token);

    try {
      await session.context.close();
    } catch (err) {
      // 忽略关闭错误
    }
  }

  /**
   * 将国际版 API URL 转为同源的页面 URL（用于 page.evaluate 中的 fetch）
   * 例如 mweb-api-sg.capcut.com/xxx → dreamina.capcut.com/xxx
   */
  private rewriteInternationalUrl(url: string): string {
    try {
      const parsed = new URL(url);
      for (const [pageHost, apiHost] of Object.entries(INTERNATIONAL_API_HOST_MAP)) {
        if (parsed.hostname === apiHost) {
          return `${parsed.protocol}//${pageHost}${parsed.pathname}${parsed.search}`;
        }
      }
    } catch {}
    return url;
  }

  /**
   * 通过浏览器代理发送 fetch 请求
   * bdms/secsdk SDK 会自动拦截 fetch 并注入 a_bogus 签名
   *
   * @param token sessionid（raw，不含前缀）
   * @param url 完整的请求 URL
   * @param options fetch 选项 (method, headers, body)
   * @param region 区域: "cn" 或 "international"
   * @returns 解析后的 JSON 响应
   */
  async fetch(
    token: string,
    url: string,
    options: { method?: string; headers?: Record<string, string>; body?: string },
    region: "cn" | "international" = "cn"
  ): Promise<any> {
    const sessionToken = region === "international" && /^[a-z]{2}-/i.test(token)
      ? token.substring(3)
      : token;
    const sessionKey = `${region}:${sessionToken}`;
    const session = await this.getSession(sessionToken, region);

    // 国际版：将 API URL 转为同源 URL，secsdk 需要同源上下文才能正确签名
    const fetchUrl = region === "international" ? this.rewriteInternationalUrl(url) : url;

    logger.info(`BrowserService: 代理请求 ${options.method || "GET"} ${fetchUrl.substring(0, 100)}...`);

    try {
      const pageDiagnosticsBeforeFetch = await this.collectPageDiagnostics(session.page);
      logger.info(`BrowserService: fetch 前页面诊断 url=${pageDiagnosticsBeforeFetch.url.substring(0, 160)}, readyState=${pageDiagnosticsBeforeFetch.readyState}, fetchHooked=${pageDiagnosticsBeforeFetch.fetchHooked}, bdms=${pageDiagnosticsBeforeFetch.hasBdms}, secsdk=${pageDiagnosticsBeforeFetch.hasSecsdk}, acrawler=${pageDiagnosticsBeforeFetch.hasBytedAcrawler}`);
      if (!this.isSessionValid(session)) {
        throw new Error("浏览器会话已失效，fetch 前检测失败");
      }

      const result = await session.page.evaluate(
        async ({ url, options }) => {
          try {
            // 确保在页面上下文中执行，让 secsdk 有机会拦截并注入签名
            const res = await window.fetch(url, {
              method: options.method || "GET",
              headers: {
                "Content-Type": "application/json",
                "x-requested-with": "XMLHttpRequest",
                ...(options.headers || {}),
              },
              body: options.body,
              credentials: "include",
            });
            const text = await res.text();
            // 返回请求的完整 URL（包含可能被 secsdk 添加的查询参数）
            return { ok: res.ok, status: res.status, text, url: res.url };
          } catch (err: any) {
            return { ok: false, status: 0, text: "", error: err.message };
          }
        },
        { url: fetchUrl, options }
      );

      // 记录实际请求的 URL，检查是否包含 X-Bogus 等签名参数
      if (result.url) {
        logger.info(`BrowserService: 实际请求 URL: ${result.url.substring(0, 200)}`);
      }

      if (result.error) {
        throw new Error(`浏览器 fetch 失败: ${result.error}`);
      }

      this.refreshSessionTimer(sessionKey, session);
      logger.info(`BrowserService: 响应状态 ${result.status}`);

      let parsedResult: any;
      try {
        parsedResult = JSON.parse(result.text);
      } catch {
        logger.warn(`BrowserService: 响应不是有效 JSON: ${result.text.substring(0, 200)}`);
        return result.text;
      }

      if (parsedResult && typeof parsedResult === "object") {
        const parsedRet = parsedResult.ret;
        const parsedErrmsg = parsedResult.errmsg;
        if (parsedRet !== undefined && Number(parsedRet) !== 0) {
          logger.warn(`BrowserService: 上游返回业务失败 ret=${parsedRet}, errmsg=${String(parsedErrmsg || "").substring(0, 160)}`);
        }
      }

      return parsedResult;
    } catch (err) {
      // 如果执行失败（页面崩溃等），清理会话以便下次重建
      logger.error(`BrowserService: 请求执行失败: ${(err as Error).message}`);
      await this.closeSession(sessionKey);
      throw err;
    }
  }

  /**
   * 关闭所有会话和浏览器实例
   */
  async close() {
    logger.info("BrowserService: 正在关闭所有会话和浏览器...");

    for (const [token] of this.sessions) {
      await this.closeSession(token);
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        // 忽略关闭错误
      }
      this.browser = null;
    }

    logger.info("BrowserService: 已关闭");
  }
}

// 单例导出
const browserService = new BrowserService();
export default browserService;
