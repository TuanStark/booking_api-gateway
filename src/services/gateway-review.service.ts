import {
    Injectable,
    ForbiddenException,
} from '@nestjs/common';
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
    ) { }

    async createReview(userId: string, body: any) {
        const { roomId, ratingOverall, ratingClean, ratingLocation, ratingPrice, ratingService, comment } = body;
        const authHeader = `Bearer ${/* how to get token here? */ ''}`; // This service seems to missing token passing in some parts, but let's focus on refactoring error handling first

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
            this.commonService.handleServiceError(error, 'verify booking information');
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
            this.commonService.handleServiceError(error, 'create review');
        }
    }
}