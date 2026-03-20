import dotenv from 'dotenv'
if (process.env.DEPLOYMENT_ENVIRONMENT?.toLowerCase() === 'test') {
  dotenv.config({ path: '.env.test' })
} else {
  dotenv.config({ path: '.env' })
}

import { createServer } from './app'

const app = createServer()
const frontendHost = process.env.LOCAL_FRONTEND_HOST
const port = process.env.PORT

app.listen(port, () => {
  console.log(`Server is running at ${frontendHost}:${port}`)
})
