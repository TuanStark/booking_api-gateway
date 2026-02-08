import {
    Injectable,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class GatewayCommonService {
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: AppConfigService,
    ) { }

    private formatToken(token: string): string {
        return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    public getData(response: any): any {
        const result = response.data;
        // Handle ResponseData wrapper if present
        if (result && typeof result === 'object' && 'statusCode' in result) {
            // If internal status code is an error, return null
            if (result.statusCode >= 400) return null;
            return result.data;
        }
        return result;
    }

    async fetchUser(id: string, token: string): Promise<any> {
        try {
            const url = `${this.configService.authServiceUrl}/user/${id}`;
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: { 'Authorization': this.formatToken(token) }
                })
            );
            return this.getData(response);
        } catch (error) {
            console.warn(`Failed to fetch user ${id}:`, error.message);
            return null;
        }
    }

    async fetchUsers(ids: string[], token: string): Promise<Map<string, any>> {
        const map = new Map<string, any>();
        if (!ids || ids.length === 0) return map;

        // Using Promise.all for parallel fetching. 
        // Note: auth-service should eventually support a /users/batch endpoint
        await Promise.all(ids.map(async id => {
            const user = await this.fetchUser(id, token);
            if (user) map.set(id, user);
        }));

        return map;
    }

    async fetchRoom(id: string, token: string): Promise<any> {
        try {
            const url = `${this.configService.roomServiceUrl}/rooms/${id}`;
            const response = await firstValueFrom(
                this.httpService.get(url, {
                    headers: { 'Authorization': this.formatToken(token) }
                })
            );
            return this.getData(response);
        } catch (error) {
            console.warn(`Failed to fetch room ${id}:`, error.message);
            return null;
        }
    }

    async fetchRooms(ids: string[], token: string): Promise<Map<string, any>> {
        const map = new Map<string, any>();
        if (!ids || ids.length === 0) return map;

        await Promise.all(ids.map(async id => {
            const room = await this.fetchRoom(id, token);
            if (room) map.set(id, room);
        }));

        return map;
    }

    handleServiceError(error: any, context: string) {
        console.error(`Error in ${context}:`, error?.response?.data || error.message);
        throw new HttpException(
            error?.response?.data?.message || `Failed to ${context}`,
            error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
}
