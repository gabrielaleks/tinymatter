import express, { Router } from 'express'
import { DevicesController } from './DevicesController'

export function createRouter(): Router {
  const router = express.Router()

  const controller = new DevicesController()

  router.get('/devices', controller.getAllDevices.bind(controller))

  return router
}