import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PeopleManagerService } from '../../manager/people/people.service.js';
import { OwnerOnly } from '../auth/public.decorator.js';
import { AddPersonRequestBodyDTO, ListPeopleResponseBodyDTO, PersonResponseBodyDTO, UpdatePersonRequestBodyDTO } from './dto/people.dto.js';

/** Settings → People (.scratch/accounts/spec.md). The Owner only. */
@ApiTags('People')
@OwnerOnly()
@Controller('people')
export class PeopleApiController {
    constructor(private readonly people: PeopleManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListPeopleResponseBodyDTO })
    async list(): Promise<ListPeopleResponseBodyDTO> {
        return { people: await this.people.list() };
    }

    @Post()
    @ApiCreatedResponse({ type: PersonResponseBodyDTO, description: 'Added as a Member. An email already listed is `EmailAlreadyListedError`.' })
    add(@Body() body: AddPersonRequestBodyDTO): Promise<PersonResponseBodyDTO> {
        return this.people.add(body.email, body.monthlyCapUsd);
    }

    @Patch(':personId')
    @ApiOkResponse({ type: PersonResponseBodyDTO })
    update(@Param('personId', ParseIntPipe) personId: number, @Body() body: UpdatePersonRequestBodyDTO): Promise<PersonResponseBodyDTO> {
        return this.people.update(personId, body);
    }

    @Delete(':personId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Removed: they can never sign in again. What they made stays.' })
    async remove(@Param('personId', ParseIntPipe) personId: number): Promise<void> {
        await this.people.remove(personId);
    }
}
