import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface UserStats {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    newUsersThisMonth: number;
    newUsersLastMonth: number;
    userGrowth: number;
}

export interface RoomStats {
    totalRooms: number;
    availableRooms: number;
    bookedRooms: number;
    maintenanceRooms: number;
    disabledRooms: number;
    occupancyRate: number;
}

export interface BookingStats {
    totalBookings: number;
    pendingBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    completedBookings: number;
    bookingsThisMonth: number;
    bookingsLastMonth: number;
    bookingGrowth: number;
    monthlyBookings: Array<{ month: string; count: number }>;
}

export interface PaymentStats {
    totalPayments: number;
    pendingPayments: number;
    successPayments: number;
    failedPayments: number;
    totalRevenue: number;
    revenueThisMonth: number;
    revenueLastMonth: number;
    revenueGrowth: number;
    monthlyRevenue: Array<{ month: string; amount: number }>;
}

export interface DashboardStats {
    users: UserStats | null;
    rooms: RoomStats | null;
    bookings: BookingStats | null;
    payments: PaymentStats | null;
    lastUpdated: string;
}

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Aggregate stats from all microservices (parallel requests)
     */
    async getAggregatedStats(token?: string): Promise<DashboardStats> {
        this.logger.log('Fetching dashboard stats from all services...');

        // Parallel fetch from all services using Promise.allSettled for graceful degradation
        const [users, rooms, bookings, payments] = await Promise.allSettled([
            this.fetchUserStats(token),
            this.fetchRoomStats(token),
            this.fetchBookingStats(token),
            this.fetchPaymentStats(token),
        ]);

        const result: DashboardStats = {
            users: this.extractResult<UserStats>(users, 'users'),
            rooms: this.extractResult<RoomStats>(rooms, 'rooms'),
            bookings: this.extractResult<BookingStats>(bookings, 'bookings'),
            payments: this.extractResult<PaymentStats>(payments, 'payments'),
            lastUpdated: new Date().toISOString(),
        };

        this.logger.log('Dashboard stats aggregation completed');
        return result;
    }

    /**
     * Extract result from Promise.allSettled, return null if rejected
     */
    private extractResult<T>(
        result: PromiseSettledResult<T>,
        name: string,
    ): T | null {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        this.logger.warn(`Failed to fetch ${name} stats: ${result.reason}`);
        return null;
    }

    /**
     * Fetch user statistics from auth-service
     */
    private async fetchUserStats(token?: string): Promise<UserStats> {
        const url = this.getServiceUrl('auth') + '/user/stats';
        return this.fetchStats<UserStats>(url, token, 'users');
    }

    /**
     * Fetch room statistics from room-service
     */
    private async fetchRoomStats(token?: string): Promise<RoomStats> {
        const url = this.getServiceUrl('rooms') + '/rooms/stats';
        return this.fetchStats<RoomStats>(url, token, 'rooms');
    }

    /**
     * Fetch booking statistics from booking-service
     */
    private async fetchBookingStats(token?: string): Promise<BookingStats> {
        const url = this.getServiceUrl('booking') + '/bookings/stats';
        return this.fetchStats<BookingStats>(url, token, 'bookings');
    }

    /**
     * Fetch payment statistics from payment-service
     */
    private async fetchPaymentStats(token?: string): Promise<PaymentStats> {
        const url = this.getServiceUrl('payment') + '/payments/stats';
        return this.fetchStats<PaymentStats>(url, token, 'payments');
    }

    /**
     * Generic fetch helper with error handling
     */
    private async fetchStats<T>(
        url: string,
        token?: string,
        serviceName?: string,
    ): Promise<T> {
        try {
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = token.startsWith('Bearer ')
                    ? token
                    : `Bearer ${token}`;
            }

            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers,
                    timeout: 10000, // 10 second timeout
                }),
            );

            // Handle different response structures
            const data = response.data?.data ?? response.data;
            return data as T;
        } catch (error: any) {
            this.logger.error(
                `Failed to fetch ${serviceName} stats from ${url}: ${error.message}`,
            );
            throw error;
        }
    }

    /**
     * Get service base URL from config
     */
    private getServiceUrl(service: string): string {
        const map: Record<string, string> = {
            auth:
                this.configService.get<string>('AUTH_SERVICE_URL') ||
                'http://auth-service:3001',
            rooms:
                this.configService.get<string>('ROOM_SERVICE_URL') ||
                'http://room-service:3003',
            booking:
                this.configService.get<string>('BOOKING_SERVICE_URL') ||
                'http://booking-service:3005',
            payment:
                this.configService.get<string>('PAYMENT_SERVICE_URL') ||
                'http://payment-service:3006',
        };

        return map[service] || '';
    }
}
