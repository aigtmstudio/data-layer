import { getDb, schema } from '../../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { exportToCsv } from './csv.js';
import { exportToGoogleSheets } from './google-sheets.js';
import { logger } from '../../lib/logger.js';

export class ExportEngine {
  async export(
    clientId: string,
    listId: string,
    format: string,
    destination?: Record<string, unknown>,
  ): Promise<{ url?: string; filePath?: string; recordsExported: number }> {
    const members = await this.getListData(listId);

    logger.info({ listId, format, recordCount: members.length }, 'Exporting list');

    switch (format) {
      case 'csv':
      case 'excel':
        return exportToCsv(members, format);
      case 'google_sheets':
        return exportToGoogleSheets(
          members,
          destination as { spreadsheetId: string; sheetName?: string },
        );
      case 'salesforce':
      case 'hubspot':
        // Stubs for future implementation
        logger.warn({ format }, 'CRM export not yet implemented');
        return { recordsExported: 0 };
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async getListData(listId: string) {
    const db = getDb();
    return db
      .select({
        companyName: schema.companies.name,
        companyDomain: schema.companies.domain,
        companyIndustry: schema.companies.industry,
        companySize: schema.companies.employeeRange,
        companyCountry: schema.companies.country,
        companyCity: schema.companies.city,
        companyLinkedin: schema.companies.linkedinUrl,
        companyWebsite: schema.companies.websiteUrl,
        contactName: schema.contacts.fullName,
        contactTitle: schema.contacts.title,
        contactEmail: schema.contacts.workEmail,
        contactPhone: schema.contacts.phone,
        contactLinkedin: schema.contacts.linkedinUrl,
        contactSeniority: schema.contacts.seniority,
        contactDepartment: schema.contacts.department,
        emailStatus: schema.contacts.emailVerificationStatus,
        icpFitScore: schema.listMembers.icpFitScore,
        addedReason: schema.listMembers.addedReason,
      })
      .from(schema.listMembers)
      .leftJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
      .leftJoin(schema.contacts, eq(schema.listMembers.contactId, schema.contacts.id))
      .where(and(eq(schema.listMembers.listId, listId), isNull(schema.listMembers.removedAt)));
  }
}
