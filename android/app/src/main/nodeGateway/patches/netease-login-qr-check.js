const createOption = require('../util/option.js')

module.exports = async (query, request) => {
  const data = {
    key: query.key,
    type: 3,
  }
  try {
    const result = await request(
      '/api/login/qrcode/client/login',
      data,
      createOption(query),
    )
    const cookies = Array.isArray(result.cookie) ? result.cookie : []
    return {
      status: 200,
      body: {
        ...result.body,
        cookie: cookies.join(';'),
      },
      cookie: cookies,
    }
  } catch {
    return {
      status: 200,
      body: {
        code: 801,
        message: '等待扫码',
      },
      cookie: [],
    }
  }
}
