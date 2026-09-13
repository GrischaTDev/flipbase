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
  calculationStatus: 'complete' | 'needs_review';
  reviewCount: number;
  salesCount: number;
  purchasesCount: number;
  grossRevenue: number;
  diff25aRevenue: number;
  regular19Revenue: number;
  totalCostOfGoodsSold: number | null;
  operatingExpenses: number;
  grossProfitMargin: number | null;
  diffTaxBase: number | null;
  vatPayable: number | null;
  inputTaxDeductible: number;
  estimatedTaxDue: number | null;
  netIncomeAfterTax: number | null;
  accountBalances: DatevAccountBalance[];
}
