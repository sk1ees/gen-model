import { readMWBFile, extractMWBContent } from "../utils/mwbParser";

export const handleMWBFile = async (file: File) => {
  const content = await readMWBFile(file);
  return extractMWBContent(content);
};
