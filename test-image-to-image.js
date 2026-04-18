// 测试图生图功能的脚本
import axios from 'axios';

// 测试配置
const config = {
  baseUrl: 'http://localhost:8000', // 本地服务地址
  token: 'YOUR_TOKEN_HERE', // 替换为你的 sessionid
  testImage: 'https://qcloud.dpfile.com/pc/8_pgQDJUpYJMSLNBpoqZ9l8WZIiTb86ar-pVroohkT5WpHUTjawvZAxm1Q1IsU7K.jpg', // 测试图片 URL
  prompt: '将这张图片转换为油画风格', // 提示词
  negativePrompt: '模糊, 低质量, 变形', // 负面提示词
  ratio: '1:1', // 图片比例
  resolution: '2k' // 分辨率
};

// 测试图生图功能
async function testImageToImage() {
  try {
    console.log('=== 测试图生图功能 ===');
    console.log('请求参数:');
    console.log('提示词:', config.prompt);
    console.log('输入图片:', config.testImage);
    console.log('比例:', config.ratio);
    console.log('分辨率:', config.resolution);
    
    // 构建请求数据
    const requestData = {
      model: 'jimeng',
      prompt: config.prompt,
      negative_prompt: config.negativePrompt,
      images: [config.testImage],
      ratio: config.ratio,
      resolution: config.resolution
    };
    
    // 发送请求
    const response = await axios.post(`${config.baseUrl}/v1/images/generations`, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      }
    });
    
    // 处理响应
    console.log('\n=== 响应结果 ===');
    console.log('状态码:', response.status);
    console.log('响应数据:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // 检查是否成功生成图片
    if (response.data && response.data.data && response.data.data.length > 0) {
      console.log('\n=== 生成的图片 ===');
      response.data.data.forEach((item, index) => {
        if (item.url) {
          console.log(`图片 ${index + 1}:`, item.url);
        } else if (item.b64_json) {
          console.log(`图片 ${index + 1}: 已返回 Base64 数据`);
        }
      });
    }
    
  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testImageToImage();
