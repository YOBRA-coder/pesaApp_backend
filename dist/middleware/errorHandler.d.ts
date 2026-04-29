import { Request, Response, NextFunction } from 'express';
export declare const errorHandler: (err: any, req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>>;
export declare const notFound: (req: Request, res: Response) => void;
//# sourceMappingURL=errorHandler.d.ts.map