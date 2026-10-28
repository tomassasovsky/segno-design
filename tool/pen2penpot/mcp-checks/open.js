const page = penpotUtils.getPages().find((p) => p.name === storage.openName);
penpot.openPage(penpotUtils.getPageById(page.id));
return page.name;
