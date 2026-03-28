import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';
import { GatewayCommonService } from './gateway-common.service';

@Injectable()
export class GatewayRoomService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: AppConfigService,
    private readonly commonService: GatewayCommonService,
  ) { }

  async getRoomDetailsComposite(roomId: string, token: string) {
    try {
      // 1. Fetch room details
      const room = await this.commonService.fetchRoom(roomId, token);
      if (!room) {
        throw new HttpException('Room not found', 404);
      }

      // 2. Fetch active and expiring bookings (using proper query params)
      const queryParams = new URLSearchParams();
      queryParams.append('status', 'CONFIRMED');
      queryParams.append('status', 'ACTIVE')
      queryParams.append('status', 'EXPIRING_SOON');

      const bookingsUrl = `${this.configService.bookingServiceUrl}/bookings/room/${roomId}?${queryParams.toString()}`;

      const bookingsRes = await firstValueFrom(
        this.httpService.get(bookingsUrl, {
          headers: {
            Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`
          },
          validateStatus: () => true
        })
      );
      let bookings = this.commonService.getData(bookingsRes);
      if (!Array.isArray(bookings)) {
        bookings = [];
      }

      // 3. Fetch user details to enrich bookings
      const userIds = [...new Set(bookings.map((b: any) => b.userId as string).filter(Boolean))] as string[];

      let usersMap = new Map();
      if (userIds.length > 0) {
        usersMap = await this.commonService.fetchUsers(userIds, token);
      }

      const activeBookings = bookings.map((b: any) => {
        const user = usersMap.get(b.userId);
        return {
          ...b,
          userName: user?.fullName || user?.email?.split('@')[0] || 'Unknown User',
          userEmail: user?.email || 'N/A'
        };
      });

      // 4. Return clean, unified DTO
      return {
        ...room,
        activeBookings
      };

    } catch (error) {
      this.commonService.handleServiceError(error, 'get room composite details');
    }
  }
}
