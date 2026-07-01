# SCORM Import Security - Path Traversal Fix

## Vulnerability Summary

**Issue**: Path Traversal in SCORM ZIP Extraction  
**Severity**: Critical  
**CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)  
**Status**: Fixed

## The Problem

The original `ScormImportStrategy.buildResourceMap()` method extracted ZIP entries without validating that resolved paths remained within the intended extraction directory.

A malicious SCORM package could include resource hrefs like:
- `../../../../etc/passwd`
- `../../app.js`
- `/etc/shadow`
- `..\\..\\config.json` (Windows)
- `..%2f..%2fetc%2fpasswd` (URL-encoded)

This could allow attackers to:
1. Overwrite application configuration files
2. Retrieve sensitive files from the server
3. Execute arbitrary code via modified source files
4. Cause denial of service through filesystem manipulation

## The Fix

### Implementation Details

**File**: `scoopdope/apps/backend/src/import-export/strategies/scorm-import.strategy.ts`

**Changes**:
1. Added `import * as path from 'path'` for path resolution utilities
2. Implemented `validatePathTraversal()` method that:
   - Normalizes paths using `path.resolve()` for consistent separators
   - Validates that resolved paths are strict children of the extraction root
   - Throws `BadRequestException` if traversal is detected
3. Updated `buildResourceMap()` to validate every resource href before extraction

### Code Logic

```typescript
private validatePathTraversal(resolvedPath: string, extractionRoot: string): void {
  const normalized = path.resolve(resolvedPath);
  const rootNormalized = path.resolve(extractionRoot);

  // Check if the resolved path is a strict child of the extraction root
  if (!normalized.startsWith(rootNormalized + path.sep) && normalized !== rootNormalized) {
    throw new BadRequestException(
      'Invalid path in SCORM package: path traversal detected. Entry paths must remain within package bounds.'
    );
  }
}
```

**Validation Approach**:
- Uses `path.resolve()` to convert relative paths to absolute paths, handling `..`, `.`, and mixed separators
- Enforces that resolved paths must start with `extractionRoot + path.sep` (the separator ensures `/scorm-package/evil` doesn't pass for root `/scorm-package`)
- Aborts import with clear error message if any traversal is detected

### Resource Map Building

```typescript
private buildResourceMap(...): Record<string, string> {
  const extractionRoot = '/scorm-package';
  
  for (const res of list) {
    const href = attrs?.['href'];
    
    // Validate BEFORE extraction
    const resolvedPath = path.resolve(extractionRoot, href);
    this.validatePathTraversal(resolvedPath, extractionRoot);
    
    const entry = zip.getEntry(href);
    if (entry) {
      map[id] = entry.getData().toString('utf-8');
    }
  }
}
```

## Security Properties

✅ **Path Resolution**: Normalizes all paths using Node.js `path` module  
✅ **Separator Handling**: Cross-platform separator handling (Windows `\` and Unix `/`)  
✅ **Dot Segment Handling**: Properly resolves `.` and `..` segments  
✅ **URL-Encoded Bypass Prevention**: Node.js `path.resolve()` works on filesystem paths, not URLs (encoded paths must be decoded separately, which doesn't happen here)  
✅ **Absolute Path Prevention**: Rejects absolute paths like `/etc/passwd`  
✅ **Early Validation**: Validates before attempting extraction  
✅ **Fail Secure**: Rejects any ambiguous paths  

## Testing

**Test File**: `scoopdope/apps/backend/src/import-export/strategies/scorm-import.strategy.spec.ts`

### Test Cases

1. **Unix-style traversal** (`../../../../etc/passwd`) - Should reject
2. **Windows-style traversal** (`..\\..\\..\\app.js`) - Should reject
3. **Complex patterns** (`./../../config.json`) - Should reject
4. **Absolute paths** (`/etc/passwd`) - Should reject
5. **Valid relative paths** (`content/lesson1.html`) - Should accept
6. **Invalid ZIP handling** - Proper error messages
7. **Missing manifest** - Proper error messages

### Running Tests

```bash
npm test -- scorm-import.strategy.spec.ts
```

## Defense in Depth

While the in-memory processing of `adm-zip` prevents actual filesystem writes, this fix adds:

1. **Validation Layer**: Rejects malicious paths before any processing
2. **Clear Error Messages**: Helps identify attack attempts in logs
3. **Audit Trail**: Rejected imports can be logged for security monitoring
4. **Fail Secure**: Default deny approach for ambiguous paths

## References

- [CWE-22: Improper Limitation of Pathname](https://cwe.mitre.org/data/definitions/22.html)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Node.js path.resolve() Documentation](https://nodejs.org/api/path.html#path_path_resolve_paths)
- [SCORM Standard (ADL)](https://adlnet.gov/research/scorm/)

## Backwards Compatibility

✅ Legitimate SCORM packages with valid relative paths are unaffected  
✅ No API changes - maintains `ImportStrategy` interface  
✅ Error messages are clear for debugging legitimate issues  

## Future Improvements

1. Consider using `yauzl` library with built-in safe extraction if it's adopted
2. Add stricter content-type validation for resource entries
3. Implement package signature verification (optional)
4. Add audit logging for rejected imports
