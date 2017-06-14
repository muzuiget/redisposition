# ReDisposition

## About Content-Disposition

If you ask a server for a file, the server may return http header [Content-Disposition][] tell browser how to handle the file, keyword `attachment` to save to harddisk, or `inline` to view it in browser. If this header is not provided, browser follow the default policy, save binary file, view text or image file.

[Content-Disposition]: http://en.wikipedia.org/wiki/MIME_content_type#Content-Disposition

## Convert encoding

If Content-Disposition form like `attachment; filename="foobar.jpg"`, the filename should be encode in UTF-8 encoding. Sadly not all server follow this standard, they normally are running on Windows, for China mainland situation, the encoding is GBK.

If Firefox decode the filename with UTF-8 fail, then it will guess the correct encoding, if fail again, you will get a wrong and ugly filename([detail][]). You have to rename it with file manager manually, annoying.

[detail]: https://bugzilla.mozilla.org/show_bug.cgi?id=844038

So this extension convert the header to explicit encoding form, like `attachment; filename*=GBK''foobar.jpg`, to solved the problem. Of course, you can custom the encodings in extension preferences panel. The value is separate by comma, default is `GB18030, BIG5`.

## Inline mode

If the file is text or image, you may prefer to view it in Firefox directly, so there is "inline" option. But Firefox still ask you to save the file if it not support that file type.