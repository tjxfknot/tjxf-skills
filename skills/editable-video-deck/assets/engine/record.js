/*EVD_RECORD_START*/
/* Public distribution: export the current HTML; video encoding requires a separate tool. */
(function () {
  const exp = document.getElementById('export');
  if (!exp || typeof EditDesk === 'undefined') return;
  const css = document.createElement('style');
  css.textContent = '#recModal{position:fixed;inset:0;z-index:9999;background:#0006;display:flex;align-items:center;justify-content:center}'
    + '#recModal>div{background:#fff;color:#222;border-radius:12px;padding:22px 26px;max-width:560px;font:15px/1.7 -apple-system,"PingFang SC",sans-serif;box-shadow:0 12px 40px #0004}'
    + '#recModal b{font-size:17px}#recModal ol{margin:8px 0 6px;padding-left:22px}#recModal code{background:#f2f2f5;padding:1px 5px;border-radius:4px;font-size:13px;word-break:break-all}'
    + '#recModal .row{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}#recModal button{padding:6px 14px}';
  document.head.append(css);

  function record() {
    if (typeof wbFlush === 'function') { try { wbFlush(); } catch (e) { } }
    document.activeElement && document.activeElement.blur();
    // 借导出时创建的下载链接拿到文件名（导出是同步的）
    let name = '';
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) name = this.download; return click.apply(this, arguments); };
    try { EditDesk.exportHTML(); } finally { HTMLAnchorElement.prototype.click = click; }
    if (!name) return;
    const m = document.createElement('div'); m.id = 'recModal'; m.setAttribute('data-ed-ui', '');
    m.innerHTML = '<div><b>已导出当前版本</b>'
      + '<p>「' + name.replace(/</g, '&lt;') + '」已存到<b>下载</b>文件夹（重名时浏览器会自动加 (1)(2)），你刚才在编辑台里的修改都在里面。</p>'
      + '<p>本集合不包含视频编码程序。请用你选择的屏幕录制或逐帧渲染工具处理导出的 HTML。</p>'
      + '<div class="row"><button type="button" data-a="ok">知道了</button></div></div>';
    m.onclick = e => { if ((e.target.dataset && e.target.dataset.a === 'ok') || e.target === m) m.remove(); };
    document.body.append(m);
  }

  // 已有按钮（导出快照里带着）就只重新绑定，没有就加；按钮带 data-ed-ui，快照导出时会被剔除
  const make = (id, after) => {
    let b = document.getElementById(id);
    if (!b && after) {
      b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = '录成视频'; b.setAttribute('data-ed-ui', '');
      b.title = '导出当前版本，显示外部视频制作说明';
      after.after(b);
    }
    if (b) b.onclick = record;
  };
  make('recordBtn', exp);
  make('wbRecordBtn', document.getElementById('wbExport'));
})();
/*EVD_RECORD_END*/
