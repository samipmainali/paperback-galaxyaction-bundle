import { PaperbackInterceptor, Request, Response } from "@paperback/types";

export class GalaxyActionInterceptor extends PaperbackInterceptor {
    override async interceptRequest(request: Request): Promise<Request> {
        request.headers = {
            ...request.headers,
            referer: `https://galaxyaction.net/`,
            "user-agent": await Application.getDefaultUserAgent(),
        };
        return request;
    }

    override async interceptResponse(
        request: Request,
        response: Response,
        data: ArrayBuffer,
    ): Promise<ArrayBuffer> {
        return data;
    }
} 