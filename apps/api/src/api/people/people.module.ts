import { Module } from '@nestjs/common';

import { PeopleManagerModule } from '../../manager/people/people.module.js';
import { PeopleApiController } from './people.controller.js';

@Module({
    imports: [PeopleManagerModule],
    controllers: [PeopleApiController],
})
export class PeopleApiModule {}
