export const JIMENG_MAX_REFERENCE_IMAGES = 2;

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

export interface JimengReferenceValidationResult {
    acceptedFiles: File[];
    rejectedFiles: File[];
    overflowFiles: File[];
}

function getFileExtension(file: Pick<File, 'name'>) {
    const dotIndex = file.name.lastIndexOf('.');
    return dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : '';
}

function isSupportedJimengImage(file: Pick<File, 'name' | 'type'>) {
    if (String(file.type || '').toLowerCase().startsWith('image/')) {
        return true;
    }

    return SUPPORTED_IMAGE_EXTENSIONS.has(getFileExtension(file));
}

function buildJimengFileKey(file: Pick<File, 'name' | 'size' | 'type' | 'lastModified'>) {
    return [file.name, file.size, file.type, file.lastModified].join(':');
}

export function validateJimengReferenceFiles(files: File[] = []): JimengReferenceValidationResult {
    const uniqueFiles: File[] = [];
    const seenKeys = new Set<string>();

    files.forEach((file) => {
        if (!file) {
            return;
        }

        const key = buildJimengFileKey(file);
        if (seenKeys.has(key)) {
            return;
        }

        seenKeys.add(key);
        uniqueFiles.push(file);
    });

    const acceptedFiles: File[] = [];
    const rejectedFiles: File[] = [];
    const overflowFiles: File[] = [];

    uniqueFiles.forEach((file) => {
        if (!isSupportedJimengImage(file)) {
            rejectedFiles.push(file);
            return;
        }

        if (acceptedFiles.length >= JIMENG_MAX_REFERENCE_IMAGES) {
            overflowFiles.push(file);
            return;
        }

        acceptedFiles.push(file);
    });

    return {
        acceptedFiles,
        rejectedFiles,
        overflowFiles,
    };
}

export function getJimengReferenceValidationMessage(result: JimengReferenceValidationResult) {
    if (result.rejectedFiles.length > 0) {
        const fileNames = result.rejectedFiles.map((file) => file.name).join('、');
        return `即梦当前页面仅支持图片参考图，请移除这些文件后重试：${fileNames}`;
    }

    if (result.overflowFiles.length > 0) {
        return `即梦当前页面最多支持 ${JIMENG_MAX_REFERENCE_IMAGES} 张参考图（首帧 / 尾帧）。`;
    }

    return '';
}
