-- Connect to the database
.open app.db

-- Check Italian language status
SELECT id, name, code, spacy_model_status 
FROM language 
WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it';

-- Update the status
UPDATE language 
SET spacy_model_status = 'not_installed' 
WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it';

-- Verify the update
SELECT id, name, code, spacy_model_status 
FROM language 
WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it';

-- Exit
.quit
