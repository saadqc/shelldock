const NAME_ICON_MAP = {
  '.gitignore': 'git',
  '.gitmodules': 'git',
  '.gitattributes': 'git',
  'dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker'
};

const EXT_ICON_MAP = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  rtf: 'word',
  xls: 'excel',
  xlsx: 'excel',
  csv: 'excel',
  ppt: 'powerpoint',
  pptx: 'powerpoint',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  bmp: 'image',
  tiff: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  avi: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  zip: 'zip',
  tar: 'zip',
  gz: 'zip',
  tgz: 'zip',
  bz2: 'zip',
  xz: 'zip',
  '7z': 'zip',
  rar: 'zip',
  js: 'js',
  jsx: 'js',
  ts: 'ts',
  tsx: 'ts',
  py: 'py',
  rb: 'rb',
  php: 'php',
  java: 'java',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  json: 'json',
  md: 'md',
  markdown: 'md',
  mdx: 'md',
  sh: 'terminal',
  bash: 'terminal',
  zsh: 'terminal',
  fish: 'terminal'
};

export function getIconClassForItem(item, isExpanded) {
  if (!item) {
    return 'icon-file';
  }
  if (item.type === 'd') {
    return isExpanded ? 'icon-folder-open' : 'icon-folder';
  }

  const name = String(item.name || '').toLowerCase();
  if (NAME_ICON_MAP[name]) {
    return `icon-${NAME_ICON_MAP[name]}`;
  }
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex !== -1 && dotIndex < name.length - 1) {
    const ext = name.slice(dotIndex + 1);
    if (EXT_ICON_MAP[ext]) {
      return `icon-${EXT_ICON_MAP[ext]}`;
    }
  }
  return 'icon-file';
}
