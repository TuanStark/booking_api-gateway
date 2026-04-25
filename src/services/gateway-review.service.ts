import { Injectable, ForbiddenException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';
import { GatewayCommonService } from './gateway-common.service';

@Injectable()
export class GatewayReviewService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: AppConfigService,
    private readonly commonService: GatewayCommonService,
  ) {}

  async createReview(userId: string, body: any) {
    const {
      roomId,
      ratingOverall,
      ratingClean,
      ratingLocation,
      ratingPrice,
      ratingService,
      comment,
    } = body;

    // 1. Check if user has booked the room
    const bookingUrl = `${this.configService.bookingServiceUrl}/bookings/check-reviewed`;
    let bookingId: string | null = null;

    try {
      const bookingRes = await firstValueFrom(
        this.httpService.get(bookingUrl, {
          params: { userId, roomId },
          headers: { 'x-user-id': userId },
        }),
      );
      console.log('Booking response:', bookingRes.data);
      bookingId = bookingRes.data?.bookingId;
    } catch (error) {
      this.commonService.handleServiceError(
        error,
        'verify booking information',
      );
    }

    if (!bookingId) {
      throw new ForbiddenException(
        'You have not completed a booking for this room, or it is not yet eligible for review.',
      );
    }

    // 2. Create review with server-resolved bookingId (client bookingId is not trusted)
    const reviewUrl = `${this.configService.reviewServiceUrl}/reviews`;
    try {
      const reviewRes = await firstValueFrom(
        this.httpService.post(
          reviewUrl,
          {
            roomId,
            bookingId,
            ratingOverall,
            ratingClean,
            ratingLocation,
            ratingPrice,
            ratingService,
            comment,
          },
          {
            headers: { 'x-user-id': userId },
            validateStatus: () => true,
          },
        ),
      );

      if (reviewRes.status >= 400) {
        const payload = reviewRes.data;
        const message =
          payload?.message ||
          payload?.error ||
          `Review service returned ${reviewRes.status}`;
        throw new HttpException(message, reviewRes.status);
      }

      return reviewRes.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.commonService.handleServiceError(error, 'create review');
    }
  }
}
