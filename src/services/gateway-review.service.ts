import {
    Injectable,
    ForbiddenException,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class GatewayReviewService {
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: AppConfigService,
    ) { }

    async createReview(userId: string, body: any) {
        const { roomId, ratingOverall, ratingClean, ratingLocation, ratingPrice, ratingService, comment } = body;

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
            console.error('Error checking booking:', error?.response?.data || error.message);
            throw new HttpException(
                'Failed to verify booking information',
                HttpStatus.BAD_GATEWAY,
            );
        }

        if (!bookingId) {
            throw new ForbiddenException(
                'You have not completed a booking for this room, or it is not yet eligible for review.',
            );
        }

        // 2. Create review with bookingId
        const reviewUrl = `${this.configService.reviewServiceUrl}/reviews`;
        try {
            const reviewRes = await firstValueFrom(
                this.httpService.post(
                    reviewUrl,
                    {
                        roomId,
                        bookingId, // Inject bookingId
                        ratingOverall,
                        ratingClean,
                        ratingLocation,
                        ratingPrice,
                        ratingService,
                        comment,
                    },
                    {
                        headers: { 'x-user-id': userId },
                    },
                ),
            );

            return reviewRes.data;
        } catch (error) {
            console.error('Error creating review:', error?.response?.data || error.message);
            throw new HttpException(
                error?.response?.data?.message || 'Failed to create review',
                error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}