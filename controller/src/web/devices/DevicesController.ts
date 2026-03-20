import { Request, Response } from 'express'

export class DevicesController {
  constructor() { }

  async getAllDevices(_req: Request, res: Response) {
    res.status(200).json({ message: `success!` })
  }
}
