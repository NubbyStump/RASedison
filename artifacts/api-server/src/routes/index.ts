import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pairingRouter from "./pairing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pairingRouter);

export default router;
