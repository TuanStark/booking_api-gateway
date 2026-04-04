import { Controller, Get, Req, HttpStatus, Param, Query } from '@nestjs/common';
import type { Request } from 'express';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  /**
   * GET /dashboard/stats
   * Aggregates statistics from all microservices for admin dashboard
   */
  @Get('stats')
  async getStats(@Req() req: Request) {
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'] as string;
    const token = authHeader || undefined;

    const stats = await this.dashboardService.getAggregatedStats(token);

    return {
      statusCode: HttpStatus.OK,
      message: 'Dashboard stats retrieved successfully',
      data: stats,
    };
  }

  /**
   * GET /dashboard/calendar
   * Gets aggregated rooms and bookings for the calendar overview
   */
  @Get('calendar')
  async getCalendar(
    @Req() req: Request,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('buildingId') buildingId?: string,
    @Query('roomId') roomId?: string,
  ) {
    const authHeader = req.headers['authorization'] as string;
    const token = authHeader || undefined;

    const data = await this.dashboardService.getCalendarComposite(
      startDate,
      endDate,
      buildingId,
      roomId,
      token,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Calendar overview retrieved successfully',
      data,
    };
  }
}
