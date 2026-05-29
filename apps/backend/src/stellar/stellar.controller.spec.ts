jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class {},
}));
jest.mock('../auth/roles.guard', () => ({
  RolesGuard: class {},
}));

import { StellarController } from './stellar.controller';

describe('StellarController', () => {
  const mockService = {
    getAccountBalance: jest.fn(),
    getTransactions: jest.fn(),
  };
  let controller: StellarController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StellarController(mockService as any, {} as any);
  });

  it('getBalance should return account balances', async () => {
    const balances = [{ asset_type: 'native', balance: '50' }];
    mockService.getAccountBalance.mockResolvedValue(balances);

    await expect(controller.getBalance('GABC')).resolves.toEqual(balances);
    expect(mockService.getAccountBalance).toHaveBeenCalledWith('GABC');
  });

  it('getTransactions should return transactions with default limit', async () => {
    const txs = [{ id: '1', hash: 'abc123', createdAt: '2024-01-01T00:00:00Z', operationCount: 1, successful: true, feeCharged: '100' }];
    mockService.getTransactions.mockResolvedValue(txs);

    await expect(controller.getTransactions('GABC')).resolves.toEqual(txs);
    expect(mockService.getTransactions).toHaveBeenCalledWith('GABC', 10);
  });

  it('getTransactions should pass custom limit', async () => {
    mockService.getTransactions.mockResolvedValue([]);

    await controller.getTransactions('GABC', '5');
    expect(mockService.getTransactions).toHaveBeenCalledWith('GABC', 5);
  });
});
