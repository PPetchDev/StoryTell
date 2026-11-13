import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'storytell:public-route';

/** A route that answers without a session even while sign-in is on (.scratch/sign-in/spec.md: "Guard"). */
export const Public = (): ClassDecorator & MethodDecorator => SetMetadata(PUBLIC_ROUTE, true);

export const OWNER_ONLY_ROUTE = 'storytell:owner-only-route';

/** A route only the Owner may use; a Member gets `OwnerOnlyError` (.scratch/accounts/spec.md: "Owner-only"). */
export const OwnerOnly = (): ClassDecorator & MethodDecorator => SetMetadata(OWNER_ONLY_ROUTE, true);
