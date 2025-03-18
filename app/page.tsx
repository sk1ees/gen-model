"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileIcon,
  CopyIcon,
  CodeIcon,
  DatabaseIcon,
  FolderIcon,
  DownloadIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toast, Toaster } from "sonner";
import { extractMWBContent, readMWBFile } from "@/src/utils/mwbParser";

interface FileContent {
  name: string;
  content: string;
  type: "sql" | "model" | "migration";
}

export default function ConvertPage() {
  const [files, setFiles] = useState<FileContent[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    sql: true,
    model: true,
    migration: true,
  });
  // Define a custom type for the non-drag event case
  type FileInputEvent = {
    dataTransfer: {
      files: FileList;
    };
  };
  // Update the handleDrop function signature
  const handleDrop = async (
    e: React.DragEvent<HTMLDivElement> | FileInputEvent
  ) => {
    // For drag and drop events
    if ("preventDefault" in e) {
      e.preventDefault();
      setIsDragging(false);
    }
    // Now TypeScript knows both branches have dataTransfer
    const files = e.dataTransfer.files;

    const mwbFiles = Array.from(files).filter((file) =>
      file.name.endsWith(".mwb")
    );

    if (mwbFiles.length === 0) {
      toast.error("Please drop only .mwb files");
      return;
    }

    const processedFiles: FileContent[] = [];
    for (const file of mwbFiles) {
      try {
        const fileContent = await readMWBFile(file);
        const { sqlContent, laravelModels, migrations } =
          extractMWBContent(fileContent);
        // Add SQL file
        processedFiles.push({
          name: `${file.name}.sql`,
          content: sqlContent,
          type: "sql",
        });

        // Add Laravel model files (one per table)
        laravelModels.forEach((model) => {
          processedFiles.push(model);
        });

        // Add migration files (one per table)
        migrations.forEach((migration) => {
          processedFiles.push(migration);
        });
      } catch (error) {
        console.error("Error processing file:", error);
        toast.error(`Failed to process ${file.name}`);
      }
    }

    setFiles((prev) => {
      const newFiles = [...prev, ...processedFiles];
      // Set the first file as selected by default if no file is currently selected
      if (!selectedFile && processedFiles.length > 0) {
        setSelectedFile(processedFiles[0]);
      }
      return newFiles;
    });

    toast.success(`Processed ${mwbFiles.length} files successfully`);
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Content copied to clipboard");
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const downloadFile = (file: FileContent) => {
    try {
      const blob = new Blob([file.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${file.name}`);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    }
  };

  const downloadAllFiles = () => {
    // This would require a library like JSZip to implement properly
    // For now, just show a toast
    toast.info("Download all functionality will be implemented soon");
  };

  const toggleSection = (type: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const filterFilesByType = (type: FileContent["type"]) => {
    return files.filter((file) => file.type === type);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Toaster theme="dark" position="top-right" />

      {/* Header with app name and actions */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-sm">
        <div className="flex items-center">
          <DatabaseIcon className="h-5 w-5 mr-2 text-blue-400" />
          <h1 className="text-xl font-semibold text-white">QRYModel</h1>
        </div>

        {files.length > 0 && (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setFiles([]);
                setSelectedFile(null);
              }}
            >
              Clear All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={downloadAllFiles}
            >
              Download All
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-col h-[calc(100vh-57px)]">
        {files.length === 0 ? (
          /* File drop area - shown when no files are processed */
          <div className="flex-1 flex items-center justify-center p-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-12 text-center transition-colors max-w-xl w-full",
                isDragging
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-800",
                "hover:border-blue-400 cursor-pointer"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fileInput")?.click()}
            >
              <input
                id="fileInput"
                type="file"
                className="hidden"
                accept=".mwb"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    handleDrop({
                      dataTransfer: { files: e.target.files },
                    } as FileInputEvent);
                  }
                }}
              />
              <div className="space-y-4">
                <div className="bg-blue-500/10 rounded-full p-4 w-20 h-20 mx-auto flex items-center justify-center">
                  <DatabaseIcon className="w-10 h-10 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-medium mb-2">
                    Drop your MySQL Workbench files
                  </h3>
                  <p className="text-zinc-400">
                    Drop .mwb files here to convert them to Laravel models,
                    migrations, and SQL
                  </p>
                </div>
                <Button className="mt-4" variant="outline">
                  Select .mwb files
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* VS Code-like editor - shown when files are processed */
          <div className="flex-1 flex overflow-hidden">
            {/* File Explorer Sidebar */}
            <div className="w-64 border-r border-zinc-800 flex flex-col">
              <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <h3 className="text-xs font-medium uppercase text-zinc-400">
                  Explorer
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Collapse sidebar"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 h-full">
                <div className="p-1">
                  {/* File type sections with collapsible folders */}
                  {[
                    {
                      type: "sql",
                      label: "SQL Files",
                      icon: (
                        <DatabaseIcon className="h-4 w-4 mr-2 text-blue-400" />
                      ),
                    },
                    {
                      type: "model",
                      label: "Model Files",
                      icon: (
                        <CodeIcon className="h-4 w-4 mr-2 text-green-400" />
                      ),
                    },
                    {
                      type: "migration",
                      label: "Migration Files",
                      icon: (
                        <FileIcon className="h-4 w-4 mr-2 text-yellow-400" />
                      ),
                    },
                  ].map((section) => (
                    <div key={section.type} className="mb-2">
                      <div
                        className="flex items-center text-xs text-zinc-400 py-1.5 px-2 hover:bg-zinc-800/50 rounded cursor-pointer"
                        onClick={() => toggleSection(section.type)}
                      >
                        <ChevronDownIcon
                          className={cn(
                            "h-3.5 w-3.5 mr-1 transition-transform",
                            !expandedSections[section.type] &&
                              "transform rotate-[-90deg]"
                          )}
                        />
                        <FolderIcon className="h-4 w-4 mr-1.5" />
                        <span>{section.label}</span>
                        <span className="ml-auto text-zinc-500 text-xs">
                          {
                            filterFilesByType(
                              section.type as FileContent["type"]
                            ).length
                          }
                        </span>
                      </div>

                      {expandedSections[section.type] && (
                        <div className="ml-4">
                          {filterFilesByType(
                            section.type as FileContent["type"]
                          ).map((file, index) => (
                            <div
                              key={`${section.type}-${index}`}
                              className={cn(
                                "flex items-center py-1 px-2 text-xs rounded cursor-pointer group",
                                selectedFile?.name === file.name
                                  ? "bg-blue-600/20 text-blue-100"
                                  : "text-zinc-300 hover:bg-zinc-800/50"
                              )}
                              onClick={() => setSelectedFile(file)}
                            >
                              {section.icon}
                              <span className="truncate">{file.name}</span>

                              {/* Show actions on hover */}
                              <div
                                className={cn(
                                  "ml-auto opacity-0 group-hover:opacity-100 transition-opacity",
                                  selectedFile?.name === file.name &&
                                    "opacity-100"
                                )}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(file.content);
                                  }}
                                  title="Copy to clipboard"
                                >
                                  <CopyIcon className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadFile(file);
                                  }}
                                  title="Download file"
                                >
                                  <DownloadIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Editor Panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor Tabs */}
              <div className="bg-zinc-900 border-b border-zinc-800 flex items-center overflow-x-auto">
                {selectedFile && (
                  <div className="flex items-center px-3 py-2 border-r border-zinc-800 bg-zinc-800 text-white text-xs">
                    {selectedFile.type === "sql" && (
                      <DatabaseIcon className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                    )}
                    {selectedFile.type === "model" && (
                      <CodeIcon className="h-3.5 w-3.5 mr-1.5 text-green-400" />
                    )}
                    {selectedFile.type === "migration" && (
                      <FileIcon className="h-3.5 w-3.5 mr-1.5 text-yellow-400" />
                    )}
                    <span className="truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 ml-2"
                      onClick={() => setSelectedFile(null)}
                      title="Close"
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Editor Content */}
              <div className="flex-1 overflow-hidden relative">
                {selectedFile ? (
                  <>
                    <ScrollArea className="h-full w-full">
                      <pre className="p-4 text-sm font-mono">
                        <code className="text-zinc-300 whitespace-pre-wrap">
                          {selectedFile.content}
                        </code>
                      </pre>
                    </ScrollArea>

                    {/* Floating action buttons */}
                    <div className="absolute bottom-4 right-4 flex space-x-2">
                      <Button
                        size="sm"
                        className="shadow-lg"
                        onClick={() => copyToClipboard(selectedFile.content)}
                      >
                        <CopyIcon className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        className="shadow-lg"
                        onClick={() => downloadFile(selectedFile)}
                      >
                        <DownloadIcon className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8 text-center">
                    <CodeIcon className="h-12 w-12 mb-4 text-zinc-700" />
                    <h3 className="text-xl font-medium mb-2">
                      No file selected
                    </h3>
                    <p className="max-w-md text-zinc-600">
                      Select a file from the explorer to view its contents, or
                      drop more .mwb files to process
                    </p>
                  </div>
                )}
              </div>

              {/* Status Bar */}
              <div className="bg-zinc-900/80 border-t border-zinc-800 px-3 py-1 text-xs text-zinc-500 flex items-center">
                <div className="flex items-center">
                  <span className="mr-4">
                    {selectedFile
                      ? `${selectedFile.type.toUpperCase()}`
                      : "Ready"}
                  </span>
                  {selectedFile && (
                    <span>{selectedFile.content.split("\n").length} lines</span>
                  )}
                </div>
                <div className="ml-auto">Laravel</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
