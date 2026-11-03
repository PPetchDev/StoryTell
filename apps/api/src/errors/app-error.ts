/**
 * Base for every typed domain error. The code is `XXX.YYY.ZZZ` (HTTP status, domain, case)
 * and is part of the API contract: the frontend routes on it. Catalogue: docs/error-codes.md.
 */
export abstract class AppError extends Error {
    readonly status: number;

    protected constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
        this.status = Number(code.slice(0, 3));
    }
}
