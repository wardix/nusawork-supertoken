import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from 'dotenv'
import axios from 'axios'

config()

const port = process.env.PORT || 3000
const nusaworkClientId = process.env.NUSAWORK_CLIENT_ID
const nusaworkClientSecret = process.env.NUSAWORK_CLIENT_SECRET
const nusaworkGrantType = process.env.NUSAWORK_GRANT_TYPE
const nusaworkUsername = process.env.NUSAWORK_USERNAME
const nusaworkPassword = process.env.NUSAWORK_PASSWORD
const apiUrlBase = process.env.NUSAWORK_PANEL_USER_API_BASE_URL
const tokenEndpoint = process.env.NUSAWORK_TOKEN_ENDPOINT_PATH
const tokenRefreshMargin = process.env.TOKEN_REFRESH_MARGIN || 60
const apiKeys = JSON.parse(process.env.API_KEYS || '[]')

const requiredConfigs = [
  nusaworkClientId,
  nusaworkClientSecret,
  nusaworkGrantType,
  nusaworkUsername,
  nusaworkPassword,
  apiUrlBase,
  tokenEndpoint,
]
if (requiredConfigs.some((config) => !config)) {
  console.error('Missing required environment variables')
  process.exit(1)
}

let cachedToken: null | string = null
let tokenExpiryTime: null | number = null

const retrieveBearerToken = async () => {
  const currentTimeInSeconds = Math.floor(Date.now() / 1000)
  const isTokenValid =
    cachedToken &&
    tokenExpiryTime &&
    currentTimeInSeconds < tokenExpiryTime - +tokenRefreshMargin

  if (isTokenValid) {
    return cachedToken
  }

  try {
    const domainApi = await fetchDomainApi()
    const response = await axios.post(`${domainApi}${tokenEndpoint}`, {
      grant_type: nusaworkGrantType,
      client_id: nusaworkClientId,
      client_secret: nusaworkClientSecret,
      username: nusaworkUsername,
      password: nusaworkPassword,
    })
    cachedToken = response.data.access_token
    tokenExpiryTime = currentTimeInSeconds + response.data.expires_in

    return cachedToken
  } catch (error) {
    console.error('Error fetching bearer token: ', error)
    throw error
  }
}

const fetchDomainApi = async () => {
  const url = `${apiUrlBase}/${nusaworkUsername}/email`
  const response = await axios.get(url)
  return response.data.data[0].domain_api
}

const fastify = Fastify({ logger: true })

const authenticateRequest = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const apiKey = request.headers['x-api-key']
  if (!apiKey || !apiKeys.includes(apiKey)) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

const setupTokenRoute = async (fastify: FastifyInstance) => {
  fastify.get('/', async (_request, reply: FastifyReply) => {
    const token = await retrieveBearerToken()
    reply.send({ token })
  })
}

fastify.addHook('preHandler', authenticateRequest)
fastify.register(setupTokenRoute, { prefix: '/token' })

fastify.listen({ port: +port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('Error starting server: ', err)
    process.exit(1)
  }
})
