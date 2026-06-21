'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Copy, Trash2, LogOut, Image as ImageIcon, Check } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface MediaItem {
  id: string;
  url: string;
  filename: string;
  alt: string;
  folder: string;
  size?: string;
  uploaded_at: string;
}

const DEFAULT_FOLDERS = ['Products', 'Banners', 'Brands', 'Other'];

export default function MediaLibraryPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MediaItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    url: '',
    filename: '',
    alt: '',
    folder: 'Products',
  });

  useEffect(() => {
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    loadMediaItems();
  }, [hasRole, router]);

  useEffect(() => {
    filterItems();
  }, [selectedFolder, searchQuery, mediaItems]);

  const loadMediaItems = () => {
    const stored = localStorage.getItem('media_library');
    if (stored) {
      setMediaItems(JSON.parse(stored));
    }
  };

  const saveMediaItems = (updatedItems: MediaItem[]) => {
    localStorage.setItem('media_library', JSON.stringify(updatedItems));
    setMediaItems(updatedItems);
  };

  const filterItems = () => {
    let filtered = mediaItems;

    if (selectedFolder !== 'All') {
      filtered = filtered.filter(item => item.folder === selectedFolder);
    }

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.alt.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredItems(filtered);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const openUploadDialog = () => {
    setFormData({
      url: '',
      filename: '',
      alt: '',
      folder: 'Products',
    });
    setIsUploadDialogOpen(true);
  };

  const handleUpload = () => {
    if (!formData.url || !formData.filename) {
      toast.error('URL and filename are required');
      return;
    }

    const newItem: MediaItem = {
      id: uuidv4(),
      url: formData.url,
      filename: formData.filename,
      alt: formData.alt || formData.filename,
      folder: formData.folder,
      uploaded_at: new Date().toISOString(),
    };

    saveMediaItems([...mediaItems, newItem]);
    toast.success('Media uploaded successfully');
    setIsUploadDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this media item?')) {
      const updated = mediaItems.filter(item => item.id !== id);
      saveMediaItems(updated);
      toast.success('Media deleted successfully');
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    }
  };

  const copyToClipboard = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('URL copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFolderCount = (folder: string) => {
    if (folder === 'All') return mediaItems.length;
    return mediaItems.filter(item => item.folder === folder).length;
  };

  if (!hasRole('admin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/cms')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Media Library</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="flex gap-6">
          <div className="w-64 shrink-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Folders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant={selectedFolder === 'All' ? 'default' : 'ghost'}
                  className="w-full justify-between"
                  onClick={() => setSelectedFolder('All')}
                >
                  <span>All Media</span>
                  <Badge variant="secondary">{getFolderCount('All')}</Badge>
                </Button>
                {DEFAULT_FOLDERS.map(folder => (
                  <Button
                    key={folder}
                    variant={selectedFolder === folder ? 'default' : 'ghost'}
                    className="w-full justify-between"
                    onClick={() => setSelectedFolder(folder)}
                  >
                    <span>{folder}</span>
                    <Badge variant="secondary">{getFolderCount(folder)}</Badge>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex-1">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Media Items</CardTitle>
                    <CardDescription>
                      {selectedFolder === 'All' ? 'All media items' : `${selectedFolder} folder`}
                    </CardDescription>
                  </div>
                  <Button onClick={openUploadDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Upload Media
                  </Button>
                </div>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search media..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {filteredItems.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">
                      {mediaItems.length === 0 ? 'No media yet' : 'No results found'}
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {mediaItems.length === 0
                        ? 'Upload your first media item to get started'
                        : 'Try adjusting your search or filter'}
                    </p>
                    {mediaItems.length === 0 && (
                      <Button onClick={openUploadDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        Upload Media
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredItems.map(item => (
                      <Card
                        key={item.id}
                        className={`cursor-pointer hover:shadow-lg transition-shadow ${
                          selectedItem?.id === item.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="aspect-square relative overflow-hidden bg-muted">
                          <img
                            src={item.url}
                            alt={item.alt}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <CardContent className="p-3">
                          <p className="text-sm font-medium truncate">{item.filename}</p>
                          <p className="text-xs text-muted-foreground">{item.folder}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedItem && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Media Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <img
                        src={selectedItem.url}
                        alt={selectedItem.alt}
                        className="w-full rounded-lg border"
                      />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Filename</Label>
                        <p className="font-medium">{selectedItem.filename}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Alt Text</Label>
                        <p>{selectedItem.alt}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Folder</Label>
                        <p>{selectedItem.folder}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Uploaded</Label>
                        <p>
                          {new Date(selectedItem.uploaded_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground mb-2 block">URL</Label>
                        <div className="flex gap-2">
                          <Input value={selectedItem.url} readOnly className="flex-1" />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(selectedItem.url, selectedItem.id)}
                          >
                            {copiedId === selectedItem.id ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="destructive"
                          onClick={() => handleDelete(selectedItem.id)}
                          className="flex-1"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription>Add a new media item to your library</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="url">Image URL *</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filename">Filename *</Label>
              <Input
                id="filename"
                value={formData.filename}
                onChange={(e) => setFormData({ ...formData, filename: e.target.value })}
                placeholder="product-image.jpg"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alt">Alt Text</Label>
              <Input
                id="alt"
                value={formData.alt}
                onChange={(e) => setFormData({ ...formData, alt: e.target.value })}
                placeholder="Product image description"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="folder">Folder</Label>
              <select
                id="folder"
                value={formData.folder}
                onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                {DEFAULT_FOLDERS.map(folder => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
