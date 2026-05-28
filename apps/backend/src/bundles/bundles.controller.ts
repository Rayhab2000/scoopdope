import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@ApiTags('bundles')
@Controller('bundles')
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all published bundles' })
  findAll() {
    return this.bundlesService.findAll(true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bundle by ID' })
  findOne(@Param('id') id: string) {
    return this.bundlesService.findOne(id);
  }

  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase/Enroll in a bundle' })
  purchase(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.bundlesService.purchase(req.user.id, id);
  }

  @Get('user/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user bundle enrollments' })
  getMyEnrollments(@Request() req: { user: { id: string } }) {
    return this.bundlesService.getEnrollments(req.user.id);
  }
}

@ApiTags('admin/bundles')
@Controller('admin/bundles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminBundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bundles (including unpublished)' })
  findAll() {
    return this.bundlesService.findAll(false);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new bundle' })
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a bundle' })
  update(@Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a bundle' })
  delete(@Param('id') id: string) {
    return this.bundlesService.delete(id);
  }
}
