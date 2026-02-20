export const CODING_CASUAL = `build me a csv parser library in typescript. needs implementation and tests

put the code in csv-parser.ts, here's what it should handle:

1. basic parsing - csv string to array of objects, first row is headers
2. quoted fields - double quotes around fields, including ones with commas inside
3. escaped quotes - two double quotes in a row = one literal quote
4. custom delimiters - let me configure the delimiter, quote char, and line separator
5. type coercion - auto detect and convert numbers (int + float), booleans (true/false case insensitive), nulls (null, NULL, empty string -> null), everything else stays as string
6. error handling - malformed rows shouldn't crash it. collect errors with row number and description
7. filtering - filter(predicate) method that returns matching rows
8. aggregation methods:
   - sum(column) - sum numeric values
   - average(column) - average numeric values
   - count() - total rows
   - groupBy(column) - group rows by column value, return a Map

main export should be parseCSV(input, options?) returning a CSVResult with: rows (array of objects), headers (string array), errors (array of {row, message}), and the filter/sum/average/count/groupBy methods

write tests in csv-parser.test.ts, just use standard assertions (throw on failure). cover:
- basic parsing
- quoted fields with commas
- escaped quotes
- custom delimiters
- type coercion for all types
- malformed row error collection
- filter functionality
- all aggregation methods
- edge cases: empty input, single column, single row, very large fields

okay thats it. actually do the work, don't just yap about it. write everything to the files`;

export const CODING_FORMAL = `You are tasked with implementing a CSV parser library in TypeScript. Create the implementation and comprehensive tests.

Requirements for the parser (implement in \`csv-parser.ts\`):

1. **Basic parsing**: Parse CSV strings into arrays of objects using the first row as headers
2. **Quoted fields**: Handle fields wrapped in double quotes, including fields containing commas
3. **Escaped quotes**: Handle escaped double quotes within quoted fields (two double quotes = one literal)
4. **Custom delimiters**: Support configurable delimiter (default comma), quote character (default double quote), and line separator
5. **Type coercion**: Automatically detect and convert:
   - Numbers (integers and floats)
   - Booleans ("true"/"false", case-insensitive)
   - Null values ("null", "NULL", empty strings → null)
   - Everything else stays as string
6. **Error handling**: Malformed rows should not crash the parser. Instead, collect errors with row number and description, and include them in the result
7. **Filtering**: Provide a \`filter(predicate)\` method that takes a function and returns only matching rows
8. **Aggregation**: Provide methods:
   - \`sum(column)\` — sum numeric values in a column
   - \`average(column)\` — average numeric values in a column
   - \`count()\` — count total rows
   - \`groupBy(column)\` — group rows by a column's values, returning a Map

The main export should be a \`parseCSV(input: string, options?: CSVOptions)\` function that returns a \`CSVResult\` object with:
- \`rows\`: parsed data as array of objects
- \`headers\`: string array of column names
- \`errors\`: array of { row: number, message: string }
- \`filter()\`, \`sum()\`, \`average()\`, \`count()\`, \`groupBy()\` methods

Write tests in \`csv-parser.test.ts\` using standard assertions (no test framework needed, just throw on failure). Tests should cover:
- Basic parsing
- Quoted fields with commas
- Escaped quotes
- Custom delimiters
- Type coercion for all types
- Malformed row error collection
- Filter functionality
- All aggregation methods
- Edge cases: empty input, single column, single row, very large fields

Please proceed by using your available tools to complete all aspects of this task. Ensure every deliverable is written to the appropriate files. I expect thorough, complete work.`;
