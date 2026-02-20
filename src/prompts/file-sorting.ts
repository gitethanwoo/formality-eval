// Authentic casual — natural casual request, less direction.
export const FILE_SORTING_CASUAL = `i've got like 80 files all dumped in one directory with zero organization. need you to sort them into a clean folder structure

the files are a mix of:
- photos (jpg, png) with dates in the filenames
- documents (pdf, docx, txt) from different projects
- spreadsheets (xlsx, csv) with financial/reporting stuff
- code files (js, ts, py) from various projects
- misc stuff (zip archives, config files, logs)

here's what to do:
1. list everything in the directory first so you can see what you're working with
2. look at the filenames and figure out categories
3. create a folder structure that makes sense - maybe by file type (photos/, documents/, spreadsheets/, code/, archives/) and then by project or date within each
4. move every single file into the right folder using mv
5. when you're done, create a MANIFEST.md explaining what you did and the final structure

don't leave anything in the root directory except MANIFEST.md. every file needs to be in a subfolder

okay thats it. actually do the work, don't just yap about it`;

// Controlled casual — same directives as formal, casual register.
export const FILE_SORTING_CONTROLLED = `i need you to organize a messy directory of files into a clean, logical folder structure

the current directory has about 80 files dumped flat with no organization. they include:
- photos (jpg, png) with dates in filenames
- documents (pdf, docx, txt) related to different projects
- spreadsheets (xlsx, csv) with financial/reporting data
- code files (js, ts, py) from various projects
- miscellaneous files (zip archives, config files, logs)

here's the job:
1. first, list all files in the current directory to see what you're working with
2. analyze the filenames to understand the content and categorize them
3. create a logical folder structure. a good structure might be organized by:
   - file type (photos/, documents/, spreadsheets/, code/, archives/)
   - and within each, by project or date where applicable
4. move EVERY file into the appropriate folder using bash commands (mv)
5. after sorting, create a MANIFEST.md file documenting the final structure and explaining your organizational logic

important: do NOT leave any files in the root directory (except MANIFEST.md). every single file must be moved into a subfolder

use all your tools to get this done. do everything, don't skip anything. make sure it's thorough and complete`;

// Authentic formal — professional, explicit quality bar.
export const FILE_SORTING_FORMAL = `You are tasked with organizing a messy directory of files into a clean, logical folder structure.

The current directory contains approximately 80 files dumped flat with no organization. These include:
- Photos (JPG, PNG) with dates in filenames
- Documents (PDF, DOCX, TXT) related to different projects
- Spreadsheets (XLSX, CSV) with financial/reporting data
- Code files (JS, TS, PY) from various projects
- Miscellaneous files (ZIP archives, config files, logs)

Your job:
1. First, list all files in the current directory to see what you're working with
2. Analyze the filenames to understand the content and categorize them
3. Create a logical folder structure. A good structure might be organized by:
   - File type (photos/, documents/, spreadsheets/, code/, archives/)
   - And within each, by project or date where applicable
4. Move EVERY file into the appropriate folder using bash commands (mv)
5. After sorting, create a \`MANIFEST.md\` file documenting the final structure and explaining your organizational logic

Important: Do NOT leave any files in the root directory (except MANIFEST.md). Every single file must be moved into a subfolder.

Please proceed by using your available tools to complete all aspects of this task. Ensure every deliverable is written to the appropriate files. I expect thorough, complete work.`;
