import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Headers('x-internal-tenant-id') tid: string, @Body() dto: CreateUserDto) {
    return this.users.create(tid, dto);
  }

  @Get()
  findAll(@Headers('x-internal-tenant-id') tid: string) {
    return this.users.findAll(tid);
  }

  @Get(':id')
  findOne(@Headers('x-internal-tenant-id') tid: string, @Param('id') id: string) {
    return this.users.findOne(tid, id);
  }

  @Patch(':id')
  update(
    @Headers('x-internal-tenant-id') tid: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(tid, id, dto);
  }
}
