'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, LogOut, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

interface StaticPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  is_published: boolean;
  seo: {
    meta_title: string;
    meta_description: string;
    keywords: string[];
  };
  updated_at: string;
}

const DEFAULT_PAGES = [
  { slug: 'about', title: 'About Us', content: 'Welcome to MadenKorea...' },
  { slug: 'contact', title: 'Contact Us', content: 'Get in touch with us...' },
  { slug: 'privacy', title: 'Privacy Policy', content: 'Your privacy is important to us...' },
  { slug: 'terms', title: 'Terms & Conditions', content: 'By using our website...' },
];

export default function StaticPagesManagementPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();
  const [pages, setPages] = useState<StaticPage[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<StaticPage | null>(null);
  const [activeTab, setActiveTab] = useState('edit');
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    is_published: true,
    meta_title: '',
    meta_description: '',
    keywords: '',
  });

  useEffect(() => {
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    loadPages();
  }, [hasRole, router]);

  const loadPages = () => {
    const stored = localStorage.getItem('static_pages');
    if (stored) {
      setPages(JSON.parse(stored));
    } else {
      const initial = DEFAULT_PAGES.map(page => ({
        id: uuidv4(),
        ...page,
        is_published: true,
        seo: {
          meta_title: page.title,
          meta_description: '',
          keywords: [],
        },
        updated_at: new Date().toISOString(),
      }));
      setPages(initial);
      localStorage.setItem('static_pages', JSON.stringify(initial));
    }
  };

  const savePages = (updatedPages: StaticPage[]) => {
    localStorage.setItem('static_pages', JSON.stringify(updatedPages));
    setPages(updatedPages);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const openDialog = (page?: StaticPage) => {
    if (page) {
      setEditingPage(page);
      setFormData({
        title: page.title,
        slug: page.slug,
        content: page.content,
        is_published: page.is_published,
        meta_title: page.seo.meta_title,
        meta_description: page.seo.meta_description,
        keywords: page.seo.keywords.join(', '),
      });
    } else {
      setEditingPage(null);
      setFormData({
        title: '',
        slug: '',
        content: '',
        is_published: true,
        meta_title: '',
        meta_description: '',
        keywords: '',
      });
    }
    setActiveTab('edit');
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.content) {
      toast.error('Title and content are required');
      return;
    }

    const slug = formData.slug || generateSlug(formData.title);

    if (editingPage) {
      const updated = pages.map((p) =>
        p.id === editingPage.id
          ? {
              ...p,
              title: formData.title,
              slug,
              content: formData.content,
              is_published: formData.is_published,
              seo: {
                meta_title: formData.meta_title,
                meta_description: formData.meta_description,
                keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
              },
              updated_at: new Date().toISOString(),
            }
          : p
      );
      savePages(updated);
      toast.success('Page updated successfully');
    } else {
      const newPage: StaticPage = {
        id: uuidv4(),
        title: formData.title,
        slug,
        content: formData.content,
        is_published: formData.is_published,
        seo: {
          meta_title: formData.meta_title,
          meta_description: formData.meta_description,
          keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
        },
        updated_at: new Date().toISOString(),
      };
      savePages([...pages, newPage]);
      toast.success('Page created successfully');
    }

    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this page?')) {
      const updated = pages.filter((p) => p.id !== id);
      savePages(updated);
      toast.success('Page deleted successfully');
    }
  };

  const togglePublished = (id: string) => {
    const updated = pages.map((p) =>
      p.id === id ? { ...p, is_published: !p.is_published, updated_at: new Date().toISOString() } : p
    );
    savePages(updated);
    toast.success('Page status updated');
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
            <h1 className="text-2xl font-bold">Static Pages</h1>
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
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Static Pages</CardTitle>
                <CardDescription>Manage informational pages like About, Contact, Privacy, Terms</CardDescription>
              </div>
              <Button onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Page
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pages.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No pages yet</h3>
                <p className="text-muted-foreground mb-6">Create your first page to get started</p>
                <Button onClick={() => openDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Page
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((page) => (
                      <TableRow key={page.id}>
                        <TableCell className="font-medium">{page.title}</TableCell>
                        <TableCell className="text-muted-foreground">/{page.slug}</TableCell>
                        <TableCell>
                          <Switch
                            checked={page.is_published}
                            onCheckedChange={() => togglePublished(page.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(page.updated_at).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openDialog(page)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(page.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage ? 'Edit Page' : 'Add Page'}</DialogTitle>
            <DialogDescription>
              {editingPage ? 'Update page content' : 'Create a new static page'}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({ ...formData, title: e.target.value });
                    if (!editingPage) {
                      setFormData({ ...formData, title: e.target.value, slug: generateSlug(e.target.value) });
                    }
                  }}
                  placeholder="About Us"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="about-us"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter your page content here..."
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_published">Published</Label>
                <Switch
                  id="is_published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">SEO Settings</h3>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="meta_title">Meta Title</Label>
                    <Input
                      id="meta_title"
                      value={formData.meta_title}
                      onChange={(e) => setFormData({ ...formData, meta_title: e.target.value })}
                      placeholder="About Us | MadenKorea"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="meta_description">Meta Description</Label>
                    <Textarea
                      id="meta_description"
                      value={formData.meta_description}
                      onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                      placeholder="Learn more about our story..."
                      rows={2}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                    <Input
                      id="keywords"
                      value={formData.keywords}
                      onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                      placeholder="about, company, story"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">{formData.title || 'Untitled Page'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none">
                    {formData.content ? (
                      <div className="whitespace-pre-wrap">{formData.content}</div>
                    ) : (
                      <p className="text-muted-foreground italic">No content yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingPage ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
