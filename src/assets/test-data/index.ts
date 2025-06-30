// Test data files for import/export functionality
import sampleCsvData from './sample-items.csv?raw';
import sampleJsonData from './sample-items.json?raw';
import sampleSqlData from './sample-items.sql?raw';

export const testDataFiles = {
  csv: {
    filename: 'sample-items.csv',
    content: sampleCsvData,
    mimeType: 'text/csv'
  },
  json: {
    filename: 'sample-items.json', 
    content: sampleJsonData,
    mimeType: 'application/json'
  },
  sql: {
    filename: 'sample-items.sql',
    content: sampleSqlData,
    mimeType: 'application/sql'
  }
};

export { sampleCsvData, sampleJsonData, sampleSqlData }; 