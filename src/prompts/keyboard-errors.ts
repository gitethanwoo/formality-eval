/**
 * "Keyboard errors" condition — controlled-casual prompts with realistic typos.
 *
 * Base: the CONTROLLED variants (same information density as formal, casual register).
 * Hand-written typos that mimic honest fast-typing mistakes:
 *   - Transpositions (teh, waht, wiht)
 *   - Dropped letters (libary, heres, actualy)
 *   - Common misspellings (seperator, audiance)
 *   - Missing apostrophes (its, heres, dont)
 *
 * Structural tokens (filenames, code identifiers, list markers) are kept intact
 * so the task spec stays unambiguous — only the human texture changes.
 *
 * Rate: ~8-10% of prose words, consistent with fast casual typing without proofreading.
 */

export const CODING_KEYBOARD_ERRORS = `build me a csv parser libary in typescript. create teh implementation and comperhensive tests

put the code in csv-parser.ts, heres what it needs to handle:

1. basic parsing - parse csv strings into arrays of objects, first row is headrs
2. quoted fields - handle fields wrapepd in double quotes, including ones with commas inside
3. escaped quotes - handle escaped double quotes within quoted fields (two double quotes = one literal)
4. custom delimiters - support configruable delimiter (default comma), quote character (default double quote), and line seperator
5. type coercion - automaticaly detect and convert:
   - numbers (integers and floats)
   - booleans (true/false, case-insensitive)
   - null values (null, NULL, empty strings -> null)
   - everthing else stays as string
6. error handling - malformed rows should not crash teh parser. collect errors with row number and description, include them in teh result
7. filtering - provide a filter(predicate) method that takes a fucntion and returns only matching rows
8. aggregation - provide methods:
   - sum(column) - sum numeric values in a column
   - average(column) - average numeric values in a column
   - count() - count total rows
   - groupBy(column) - group rows by a column's values, returniing a Map

main export should be a parseCSV(input: string, options?: CSVOptions) function returning a CSVResult wiht:
- rows: parsed data as array of objects
- headers: string array of column names
- errors: array of { row: number, message: string }
- filter(), sum(), average(), count(), groupBy() methods

write tests in csv-parser.test.ts using standard assertions (no test framework, jsut throw on failure). tests shuold cover:
- basic parsing
- quoted fields with commas
- escaped quotes
- custom delimiters
- type coercion for all types
- malformed row error collectoin
- filter funcitonality
- all aggregation methods
- edge cases: empty input, single column, signle row, very large fields

use all your tools to get this done. do evrything, don't skip anyhting. i want to see every single file written. make sure its thorough and complete`;

export const COPYWRITING_KEYBOARD_ERRORS = `create a full marketing launch campagin for lumina. its a new smart desk lamp that adjusts color tempreature and brightness based on time of day, calendar events, and ambient room lighting. $149 retail, target audiance is remote workers 25-40

you need to do ALL of thees, each one gets its own file:

1. tagline.txt - memorable brand tagline (one line)
2. hero-copy.txt - hero section copy for teh landing page (headline + 2-3 paragraphs)
3. email-sequence.txt - 3-email launch sequence (subject lines + full body for eahc)
4. social-posts.txt - social media posts for 3 platforms (twitter/x, instagram, linkedin), at least 2 posts per platfrom
5. landing-page.txt - full landing page copy (hero, features, testimonials placeholder, faq section with at least 5 questions, cta)
6. press-release.txt - press release annoucing the product launch (proper pr format with headline, dateline, body, boilerplate)

the copy should be compeling, on-brand, and like actualy production ready

use all yoru tools to get this done. do everything, don't skip anyhting. i want to see every single file writen. make sure its thorough and compelte`;

export const FILE_SORTING_KEYBOARD_ERRORS = `i need you to organize a messy direcotry of files into a clean, logical folder strucutre

the current directory has about 80 files dumepd flat with no organization. they incldue:
- photos (jpg, png) with dates in filenmaes
- documents (pdf, docx, txt) realted to different projects
- spreadsheets (xlsx, csv) with financial/reporting data
- code files (js, ts, py) from varoius projects
- miscellaneous files (zip archives, config files, logs)

heres the job:
1. first, list all files in the current directory to see waht you're working with
2. analyze the filenames to undrestand teh content and categorize them
3. create a logical folder structure. a good strucutre might be organized by:
   - file type (photos/, documents/, spreadsheets/, code/, archives/)
   - and within each, by project or date where applicabel
4. move EVERY file into the appropriate folder using bash comamnds (mv)
5. after sorting, create a MANIFEST.md file documenting teh final structure and explaning your organizational logic

important: do NOT leave any files in teh root directory (except MANIFEST.md). every single file must be moved into a subfodler

use all your tools to get this done. do everthing, don't skip anyhting. make sure its thorough and compelete`;
