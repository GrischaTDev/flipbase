export interface TaxAdvisorConfig {
  firmName: string;
  advisorEmail: string;
  clientNumber: string;
  consultantNumber: string;
  skrStandard: 'SKR03' | 'SKR04';
  autoSendOnFirstOfMonth: boolean;
  includeDiffTaxJournal: boolean;
  includeDatevBookingStack: boolean;
  includePdfReport: boolean;
}

export interface DatevAccountBalance {
  accountNumber: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface MonthlyTaxReport {
  periodLabel: string;
  periodKey: string;
  generatedAt: string;
  workspaceName: string;
  taxAdvisor: TaxAdvisorConfig;
  salesCount: number;
  purchasesCount: number;
  grossRevenue: number;
  diff25aRevenue: number;
  regular19Revenue: number;
  totalCostOfGoodsSold: number;
  operatingExpenses: number;
  grossProfitMargin: number;
  diffTaxBase: number;
  vatPayable: number;
  inputTaxDeductible: number;
  estimatedTaxDue: number;
  netIncomeAfterTax: number;
  accountBalances: DatevAccountBalance[];
}
