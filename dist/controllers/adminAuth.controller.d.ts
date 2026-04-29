import { Request, Response, NextFunction } from 'express';
export declare const adminLogin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const adminVerify2FA: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const adminSetupPassword: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const inviteStaff: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const listStaff: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=adminAuth.controller.d.ts.map