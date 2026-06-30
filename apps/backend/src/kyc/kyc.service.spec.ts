import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycCustomer, KycStatus } from './kyc-customer.entity';
import { EncryptionService } from '../common/encryption.service';

describe('KycService', () => {
  let service: KycService;

  const mockRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(''),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v.replace(/^enc\(/, '').replace(/\)$/, '')),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: getRepositoryToken(KycCustomer), useValue: mockRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── handleWebhook ─────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    const stellarPublicKey = 'GABCDEF1234567890';

    const makeCustomer = (status: KycStatus = 'pending'): KycCustomer =>
      Object.assign(new KycCustomer(), { id: 'uuid', stellarPublicKey, status });

    it('sets status to "approved" when provider sends APPROVED', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'approved' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'APPROVED' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('sets status to "approved" when provider sends VERIFIED', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'approved' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'VERIFIED' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('sets status to "rejected" when provider sends REJECTED', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'rejected' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'REJECTED' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    it('sets status to "rejected" when provider sends DECLINED', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'rejected' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'DECLINED' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    it('sets status to "pending" when provider sends PENDING', async () => {
      const customer = makeCustomer('approved');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'pending' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'PENDING' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('defaults to "pending" for an unknown/unexpected status value', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue(customer);

      await service.handleWebhook({ alias: stellarPublicKey, status: 'UNKNOWN_STATUS' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('handles status strings case-insensitively (lowercase approved)', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'approved' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'approved' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    it('handles status strings case-insensitively (mixed case Rejected)', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue({ ...customer, status: 'rejected' });

      await service.handleWebhook({ alias: stellarPublicKey, status: 'Rejected' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    it('does not grant access when status is rejected — isApproved returns false', async () => {
      const customer = makeCustomer('rejected');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue(customer);

      await service.handleWebhook({ alias: stellarPublicKey, status: 'REJECTED' });

      // Verify the saved state would block isApproved()
      const savedCustomer = mockRepo.save.mock.calls[0][0] as KycCustomer;
      expect(savedCustomer.status).not.toBe('approved');
    });

    it('returns early without saving when alias is missing', async () => {
      await service.handleWebhook({ status: 'APPROVED' } as any);

      expect(mockRepo.findOne).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('returns early without throwing when customer is not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.handleWebhook({ alias: 'UNKNOWN_KEY', status: 'APPROVED' }),
      ).resolves.toBeUndefined();

      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('does not throw for completely empty payload status', async () => {
      const customer = makeCustomer('pending');
      mockRepo.findOne.mockResolvedValue(customer);
      mockRepo.save.mockResolvedValue(customer);

      await expect(
        service.handleWebhook({ alias: stellarPublicKey, status: '' }),
      ).resolves.toBeUndefined();

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });
  });

  // ── isApproved ─────────────────────────────────────────────────────────────

  describe('isApproved', () => {
    it('returns true when customer status is approved', async () => {
      mockRepo.findOne.mockResolvedValue(
        Object.assign(new KycCustomer(), { stellarPublicKey: 'KEY', status: 'approved' }),
      );
      await expect(service.isApproved('KEY')).resolves.toBe(true);
    });

    it('returns false when customer status is pending', async () => {
      mockRepo.findOne.mockResolvedValue(
        Object.assign(new KycCustomer(), { stellarPublicKey: 'KEY', status: 'pending' }),
      );
      await expect(service.isApproved('KEY')).resolves.toBe(false);
    });

    it('returns false when customer status is rejected', async () => {
      mockRepo.findOne.mockResolvedValue(
        Object.assign(new KycCustomer(), { stellarPublicKey: 'KEY', status: 'rejected' }),
      );
      await expect(service.isApproved('KEY')).resolves.toBe(false);
    });

    it('returns false when customer does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.isApproved('NONEXISTENT')).resolves.toBe(false);
    });
  });
});
