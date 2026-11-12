import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'storytell:public-route';

/** A route that answers without a session even while sign-in is on (.scratch/sign-in/spec.md: "Guard"). */
export const Public = (): ClassDecorator & MethodDecorator => SetMetadata(PUBLIC_ROUTE, true);
