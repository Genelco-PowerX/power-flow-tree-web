import Airtable from 'airtable';
import { EquipmentConnection } from './types';

// Get environment variables
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

// Initialize Airtable client only when needed
function getAirtableClient() {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    throw new Error('Missing required Airtable environment variables. Please check .env.local file.');
  }

  const base = new Airtable({
    apiKey: AIRTABLE_API_KEY
  }).base(AIRTABLE_BASE_ID);

  return base(AIRTABLE_TABLE_ID);
}

// Safe field access function (ported from Airtable extension)
function safeGetCellValue(record: any, fieldNames: string[]): string | null {
  for (const fieldName of fieldNames) {
    try {
      const value = record.getCellValueAsString ?
        record.getCellValueAsString(fieldName) :
        record.get(fieldName);
      if (value && typeof value === 'string') return value;
    } catch {
      continue; // Try next field name variation
    }
  }
  return null;
}

function normalizeSourceNumber(value: unknown): 'S1' | 'S2' {
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    if (v === 'S2' || v === '2' || v === 'SOURCE 2') return 'S2';
    return 'S1';
  }
  if (typeof value === 'number') {
    return value === 2 ? 'S2' : 'S1';
  }
  return 'S1';
}

export async function getEquipmentConnections(): Promise<EquipmentConnection[]> {
  try {
    const connectionsTable = getAirtableClient();
    // First, let's discover what fields are actually available
    const testRecords = await connectionsTable.select({ maxRecords: 1 }).all();
    if (testRecords.length > 0) {
      console.log('Available fields in Airtable:', Object.keys(testRecords[0].fields));
    }

    // Fetch records without specifying fields to get all available fields
    const records = await connectionsTable.select().all();

    const connections: EquipmentConnection[] = [];

    records.forEach(record => {
      try {
        // Handle linked record IDs (can be string or object format)
        const fromIds = record.get('From') || [];
        const toIds = record.get('To') || [];

        // Get equipment names and types using the actual field names from Airtable
        // Based on the API documentation, the field names are arrays
        const fromNameArray = record.get('From Equipment Name') as string[] || [];
        const fromName = Array.isArray(fromNameArray) && fromNameArray.length > 0 ? fromNameArray[0] : 'Unnamed';

        const fromType = record.get('From Equipment Type') as string || 'Unknown Type';

        const toNameArray = record.get('To Equipment Name') as string[] || [];
        const toName = Array.isArray(toNameArray) && toNameArray.length > 0 ? toNameArray[0] : 'Unnamed';

        const toType = record.get('To Equipment Type') as string || 'Unknown Type';

        const sourceNumber = normalizeSourceNumber(record.get('Source Number'));

        // Create connection record
        connections.push({
          id: record.id,
          from: Array.isArray(fromIds) ? fromIds.map(id => typeof id === 'object' ? id.id : id) : [],
          to: Array.isArray(toIds) ? toIds.map(id => typeof id === 'object' ? id.id : id) : [],
          sourceNumber,
          fromName,
          fromType,
          toName,
          toType
        });

      } catch (error) {
        console.error('Error processing connection record:', error);
        // Continue processing other records
      }
    });

    console.log(`Successfully fetched ${connections.length} equipment connections`);
    return connections;

  } catch (error) {
    console.error('Error fetching equipment connections from Airtable:', error);
    throw new Error('Failed to fetch equipment connections from Airtable');
  }
}

export async function getEquipmentList(): Promise<Array<{id: string, name: string, type: string}>> {
  try {
    const connections = await getEquipmentConnections();
    const equipmentMap = new Map<string, {name: string, type: string}>();

    // Extract unique equipment from connections
    connections.forEach(connection => {
      // Add 'from' equipment
      connection.from.forEach(id => {
        if (!equipmentMap.has(id)) {
          equipmentMap.set(id, {
            name: connection.fromName,
            type: connection.fromType
          });
        }
      });

      // Add 'to' equipment
      connection.to.forEach(id => {
        if (!equipmentMap.has(id)) {
          equipmentMap.set(id, {
            name: connection.toName,
            type: connection.toType
          });
        }
      });
    });

    // Convert to array format
    return Array.from(equipmentMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      type: data.type
    }));

  } catch (error) {
    console.error('Error generating equipment list:', error);
    throw new Error('Failed to generate equipment list');
  }
}
