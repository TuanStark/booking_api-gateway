import {
    Injectable,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';
import { GatewayCommonService } from './gateway-common.service';

@Injectable()
export class GatewayBookingService {
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: AppConfigService,
        private readonly commonService: GatewayCommonService,
    ) { }

    async getDetailBooking(userId: string, bookingId: string, token: string) {
        const url = `${this.configService.bookingServiceUrl}/bookings/${bookingId}`;
        try {
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: {
                        'x-user-id': userId,
                        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
                    },
                }),
            );

            const booking = this.commonService.getData(response);
            const enriched = await this.enrichBookings([booking], token);
            return enriched[0];
        } catch (error) {
            this.commonService.handleServiceError(error, 'get booking detail');
        }
    }

    async getMyBookings(userId: string, token: string) {
        const url = `${this.configService.bookingServiceUrl}/bookings/my-bookings`;
        try {
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: {
                        'x-user-id': userId,
                        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
                    },
                }),
            );

            const bookings = this.commonService.getData(response);
            if (!Array.isArray(bookings)) return bookings;

            return await this.enrichBookings(bookings, token);
        } catch (error) {
            this.commonService.handleServiceError(error, 'get my bookings');
        }
    }

    async getAllBookings(token: string, query: any) {
        const url = `${this.configService.bookingServiceUrl}/bookings`;
        try {
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    params: query,
                    headers: {
                        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
                    },
                }),
            );

            const result = this.commonService.getData(response);
            const bookings = Array.isArray(result) ? result : result.data;

            if (Array.isArray(bookings)) {
                const enriched = await this.enrichBookings(bookings, token);
                if (Array.isArray(result)) return enriched;
                return { ...result, data: enriched };
            }

            return result;
        } catch (error) {
            this.commonService.handleServiceError(error, 'get all bookings');
        }
    }

    private async enrichBookings(bookings: any[], token: string) {
        if (!bookings || bookings.length === 0) return bookings;

        const userIds = [...new Set(bookings.map(b => b.userId).filter(id => id))];
        const roomIds = [...new Set(bookings.flatMap(b => b.details?.map(d => d.roomId)).filter(id => id))];

        const [usersMap, roomsMap] = await Promise.all([
            this.commonService.fetchUsers(userIds, token),
            this.commonService.fetchRooms(roomIds, token)
        ]);

        return bookings.map(booking => ({
            ...booking,
            user: usersMap.get(booking.userId) || null,
            details: booking.details?.map(detail => ({
                ...detail,
                room: roomsMap.get(detail.roomId) || null
            })) || []
        }));
    }
}