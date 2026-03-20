import { Request, Response, NextFunction } from "express";
declare global {
    namespace Express {
        interface Request {
            userId: string;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.d.ts.map