import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rawInput = process.argv[2];

if (!rawInput) {
    console.log("Usage: node convert.js <path_to_your_file>");
    process.exit(1);
}

// Ensure we are working with clean, absolute file structures
const absoluteInputPath = path.resolve(rawInput);
const fileDirectory = path.dirname(absoluteInputPath);
const fileNameWithoutExt = path.basename(absoluteInputPath, path.extname(absoluteInputPath));

// Standard target output names
const targetJsonFile = path.join(fileDirectory, fileNameWithoutExt + '.json');
const targetBackupFile = path.join(fileDirectory, fileNameWithoutExt + '.bkp');
const tempCsvPath = path.join(fileDirectory, fileNameWithoutExt + '.csv');

// Function to handle backup rotation
function handleBackupRotation() {
    if (fs.existsSync(targetJsonFile)) {
        if (fs.existsSync(targetBackupFile)) {
            fs.unlinkSync(targetBackupFile);
        }
        fs.renameSync(targetJsonFile, targetBackupFile);
        console.log(`Existing file backed up to: ${fileNameWithoutExt}.bkp`);
    }
}

// Robust, standard-compliant CSV parser
function parseCsvToJson(csvText) {
    const lines = csvText.split(/\r?\n/);
    const result = [];
    let headers = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty rows

        const cells = [];
        let insideQuotes = false;
        let currentCell = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const nextChar = line[j + 1];

            if (char === '"') {
                // If it's a doubled quote inside a quoted field, treat it as a single literal quote
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    j++; // Skip the second quote character
                } else {
                    insideQuotes = !insideQuotes; // Toggle quoting state
                }
            } else if (char === ',' && !insideQuotes) {
                cells.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        cells.push(currentCell.trim());

        // Establish headers from the very first valid row
        if (!headers) {
            headers = cells;
            continue;
        }

        // Build the JSON row object mapping columns to headers
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = cells[index] !== undefined ? cells[index] : "";
        });
        result.push(obj);
    }
    return result;
}

try {
    console.log("Converting ODS to CSV securely via LibreOffice headless...");
    
    // Convert directly into the source directory
    execSync(`libreoffice --headless --convert-to csv --outdir "${fileDirectory}" "${absoluteInputPath}"`, { stdio: 'ignore' });

    if (!fs.existsSync(tempCsvPath)) {
        throw new Error(`LibreOffice conversion failed. Expected CSV at: ${tempCsvPath}`);
    }

    // Read and parse the CSV content
    const csvData = fs.readFileSync(tempCsvPath, 'utf-8');
    const jsonData = parseCsvToJson(csvData);
    
    // Rotate old JSON files to backup format
    handleBackupRotation();
    
    // Write out the fresh JSON file
    fs.writeFileSync(targetJsonFile, JSON.stringify(jsonData, null, 4), 'utf-8');
    console.log(`Success! Saved safely to: ${targetJsonFile}`);

} catch (error) {
    console.error(`Error: ${error.message}`);
} finally {
    // Structural block forces execution of the cleanup loop
    if (fs.existsSync(tempCsvPath)) {
        fs.unlinkSync(tempCsvPath);
    }
}
