import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/config.service';
import { GatewayCommonService } from './gateway-common.service';

/**
 * Gọi payment-service rồi gắn thêm `user` từ auth-service (cùng pattern {@link GatewayBookingService}).
 */
@Injectable()
export class GatewayPaymentService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: AppConfigService,
    private readonly commonService: GatewayCommonService,
  ) {}

  async getDetailPayment(userId: string, paymentId: string, token: string) {
    const url = `${this.configService.paymentServiceUrl}/payments/${paymentId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'x-user-id': userId,
            Authorization: token.startsWith('Bearer ')
              ? token
              : `Bearer ${token}`,
          },
          validateStatus: () => true,
        }),
      );

      if (response.status >= 400) {
        throw new HttpException(
          response.data?.message || 'Payment not found',
          response.status,
        );
      }

      const payment = this.commonService.getData(response);
      if (payment == null) {
        throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
      }

      const enriched = await this.enrichPayments([payment], token);
      return enriched[0];
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.commonService.handleServiceError(error, 'get payment detail');
    }
  }

  async getAllPayments(
    token: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.configService.paymentServiceUrl}/payments`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          params: query,
          headers: {
            Authorization: token.startsWith('Bearer ')
              ? token
              : `Bearer ${token}`,
          },
        }),
      );

      const result = this.commonService.getData(response);
      const payments = Array.isArray(result) ? result : result?.data;

      if (Array.isArray(payments)) {
        const enriched = await this.enrichPayments(payments, token);
        if (Array.isArray(result)) return enriched;
        return { ...result, data: enriched };
      }

      return result;
    } catch (error) {
      this.commonService.handleServiceError(error, 'get all payments');
    }
  }

  private async enrichPayments(
    payments: Record<string, unknown>[],
    token: string,
  ): Promise<Record<string, unknown>[]> {
    if (!payments?.length) return payments;

    const userIds = [
      ...new Set(
        payments
          .map((p) => p.userId as string | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const usersMap = await this.commonService.fetchUsers(userIds, token);

    return payments.map((payment) => ({
      ...payment,
      user: usersMap.get(payment.userId as string) ?? payment.user ?? null,
    }));
  }
}
