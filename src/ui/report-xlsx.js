(function(global){
  const encoder = new TextEncoder();
  const crcTable = (function(){
    const table = new Uint32Array(256);
    for(let index = 0; index < 256; index += 1){
      let value = index;
      for(let bit = 0; bit < 8; bit += 1){
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function safeText(value){
    if(typeof global.bsfSpreadsheetSafeText === 'function') return global.bsfSpreadsheetSafeText(value);
    return String(value === null || value === undefined ? '' : value);
  }

  function xmlEscape(value){
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function finite(value){
    if(value === null || value === undefined) return null;
    const text = String(value).trim();
    if(text === '' || text === '—') return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function column(index){
    let value = index + 1;
    let result = '';
    while(value > 0){
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function inlineCell(ref, value, style){
    const styleAttr = style ? ' s="' + style + '"' : '';
    if(value === null || value === undefined || value === '') return '<c r="' + ref + '"' + styleAttr + '/>';
    return '<c r="' + ref + '"' + styleAttr + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
  }

  function numberCell(ref, value, style){
    const number = finite(value);
    const styleAttr = style ? ' s="' + style + '"' : '';
    if(number === null) return '<c r="' + ref + '"' + styleAttr + '/>';
    return '<c r="' + ref + '"' + styleAttr + '><v>' + number + '</v></c>';
  }

  function sortRows(rows){
    return (Array.isArray(rows) ? rows : []).map(function(row){
      return {
        recordedAt:String(row && row.recordedAt || ''),
        device:String(row && row.device || '—'),
        weight:finite(row && row.weight),
        temperature:finite(row && row.temperature),
        humidity:finite(row && row.humidity),
      };
    }).sort(function(left, right){
      return left.device.localeCompare(right.device) || left.recordedAt.localeCompare(right.recordedAt);
    });
  }

  function recordedDateKey(value){
    const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(!match) return '';
    return match[1] + '-' + String(Number(match[2])).padStart(2, '0') + '-' + String(Number(match[3])).padStart(2, '0');
  }

  function periodCategories(options, rows){
    if(options.chartPeriod === 'yearly'){
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    }
    const startText = String(options.periodStart || '');
    const endText = String(options.periodEnd || '');
    const startMatch = startText.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if(startMatch){
      const year = Number(startMatch[1]);
      const month = Number(startMatch[2]);
      const lastDay = endText.slice(0, 7) === startText.slice(0, 7)
        ? Number(endText.slice(8, 10))
        : new Date(Date.UTC(year, month, 0)).getUTCDate();
      return Array.from({ length:lastDay }, function(_, index){ return String(index + 1); });
    }
    const keys = Array.from(new Set(rows.map(function(row){
      return recordedDateKey(row.recordedAt);
    }).filter(Boolean))).sort();
    if(!keys.length) return [];
    const first = keys[0];
    const last = keys[keys.length - 1];
    const year = Number(first.slice(0, 4));
    const month = Number(first.slice(5, 7));
    const lastDay = last.slice(0, 7) === first.slice(0, 7)
      ? Number(last.slice(8, 10))
      : new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length:lastDay }, function(_, index){ return String(index + 1); });
  }

  function chartDataFor(rows, key, options){
    const yearly = options.chartPeriod === 'yearly';
    const categories = periodCategories(options, rows);
    const positions = new Map(categories.map(function(label, index){ return [label, index]; }));
    const deviceBuckets = new Map();
    rows.forEach(function(row){
      const value = finite(row[key]);
      const dateKey = recordedDateKey(row.recordedAt);
      if(value === null || !dateKey) return;
      const category = yearly ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(dateKey.slice(5, 7)) - 1] : String(Number(dateKey.slice(8, 10)));
      const position = positions.get(category);
      if(position === undefined) return;
      const device = String(row.device || '—');
      const buckets = deviceBuckets.get(device) || new Map();
      const bucket = buckets.get(position) || { sum:0, count:0, max:null };
      bucket.sum += value;
      bucket.count += 1;
      bucket.max = bucket.max === null ? value : Math.max(bucket.max, value);
      buckets.set(position, bucket);
      deviceBuckets.set(device, buckets);
    });
    return {
      categories:categories,
      series:Array.from(deviceBuckets.entries()).sort(function(left, right){
        return left[0].localeCompare(right[0]);
      }).map(function(entry){
        const buckets = entry[1];
        return {
          name:entry[0],
          values:categories.map(function(_, index){
            const bucket = buckets.get(index);
            if(!bucket) return null;
            return key === 'weight' ? bucket.max : bucket.sum / bucket.count;
          }),
        };
      }),
    };
  }

  function columnLetterToIndex(value){
    let index = 0;
    String(value || '').toUpperCase().split('').forEach(function(letter){
      index = index * 26 + letter.charCodeAt(0) - 64;
    });
    return Math.max(4, index);
  }

  function chartHelperXml(chartData){
    const series = chartData.series;
    const lastColumn = column(6 + Math.max(0, series.length - 1));
    const rows = ['<row r="1">' + inlineCell('F1', 'Chart Day', 1) +
      series.map(function(item, index){ return inlineCell(column(6 + index) + '1', item.name, 1); }).join('') +
      '</row>'];
    chartData.categories.forEach(function(label, index){
      const rowNumber = index + 2;
      rows.push('<row r="' + rowNumber + '">' + inlineCell('F' + rowNumber, label) +
        series.map(function(item, seriesIndex){
          return numberCell(column(6 + seriesIndex) + rowNumber, item.values[index]);
        }).join('') + '</row>');
    });
    return {
      rows:rows.join(''),
      categoryRange:'$F$2:$F$' + Math.max(2, chartData.categories.length + 1),
      seriesRanges:series.map(function(_, index){
        const letter = column(6 + index);
        return '$' + letter + '$2:$' + letter + '$' + Math.max(2, chartData.categories.length + 1);
      }),
      lastColumn:lastColumn,
    };
  }

  function worksheetXml(name, title, key, rows, index, chartData){
    const sheetRows = rows.map(function(row, rowIndex){
      const rowNumber = rowIndex + 2;
      return '<row r="' + rowNumber + '">' +
        inlineCell('A' + rowNumber, row.recordedAt) +
        inlineCell('B' + rowNumber, row.device) +
        numberCell('C' + rowNumber, row[key]) +
        '</row>';
    }).join('');
    const header = '<row r="1">' +
      inlineCell('A1', 'Recorded Time', 1) +
      inlineCell('B1', 'Device', 1) +
      inlineCell('C1', title, 1) +
      '</row>';
    const helper = chartHelperXml(chartData);
    const lastRow = Math.max(rows.length + 1, chartData.categories.length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + helper.lastColumn + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols><col min="1" max="1" width="22" customWidth="1"/>' +
      '<col min="2" max="2" width="24" customWidth="1"/>' +
      '<col min="3" max="3" width="14" customWidth="1"/>' +
      '<col min="4" max="' + columnLetterToIndex(helper.lastColumn) + '" width="14" customWidth="1" hidden="1"/></cols>' +
      '<sheetData>' + header + sheetRows + helper.rows + '</sheetData>' +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<drawing r:id="rId1"/>' +
      '</worksheet>';
  }

  function chartTitleXml(title){
    return '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r>' +
      '<a:rPr lang="en-US" sz="1200" b="1"/><a:t>' + xmlEscape(title) + '</a:t>' +
      '</a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>';
  }

  function axisLineXml(){
    return '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="A6A6A6"/></a:solidFill></a:ln></c:spPr>';
  }

  function majorGridlinesXml(){
    return '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill>' +
      '<a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  }

  function chartSeriesXml(sheetName, series, ranges, spec){
    const colors = ['4472C4', '70AD47', 'ED7D31', 'A5A5A5', '5B9BD5', 'FFC000'];
    const ref = "'" + sheetName.replace(/'/g, "''") + "'!";
    return series.map(function(item, index){
      const color = colors[index % colors.length];
      return '<c:ser><c:idx val="' + index + '"/><c:order val="' + index + '"/>' +
        '<c:tx><c:v>' + xmlEscape(series.length === 1 ? spec.seriesName : item.name) + '</c:v></c:tx>' +
        '<c:spPr><a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill>' +
        '<a:round/></a:ln></c:spPr>' +
        '<c:marker><c:symbol val="none"/></c:marker>' +
        '<c:cat><c:strRef><c:f>' + ref + ranges.categoryRange + '</c:f></c:strRef></c:cat>' +
        '<c:val><c:numRef><c:f>' + ref + ranges.seriesRanges[index] + '</c:f></c:numRef></c:val>' +
        '<c:smooth val="0"/></c:ser>';
    }).join('');
  }

  function chartXml(sheetName, title, chartData, index, spec, options){
    const catAxisId = 1000 + index * 10;
    const valAxisId = catAxisId + 1;
    const labelRotation = chartData.categories.length > 12 ? '-2700000' : '0';
    const chartTitle = options.chartTitle || title;
    const ranges = chartHelperXml(chartData);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<c:lang val="en-US"/><c:roundedCorners val="0"/><c:chart>' +
      chartTitleXml(chartTitle) +
      '<c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' +
      chartSeriesXml(sheetName, chartData.series, ranges, spec) +
      '<c:marker val="0"/><c:axId val="' + catAxisId + '"/><c:axId val="' + valAxisId + '"/></c:lineChart>' +
      '<c:catAx><c:axId val="' + catAxisId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
      '<c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/>' +
      '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
      axisLineXml() +
      '<c:txPr><a:bodyPr rot="' + labelRotation + '"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
      '<c:crossAx val="' + valAxisId + '"/><c:crosses val="autoZero"/><c:auto val="1"/>' +
      '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickLblSkip val="1"/>' +
      '<c:tickMarkSkip val="1"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
      '<c:valAx><c:axId val="' + valAxisId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
      '<c:delete val="0"/><c:axPos val="l"/>' + majorGridlinesXml() +
      '<c:numFmt formatCode="' + spec.valueFormat + '" sourceLinked="0"/><c:majorTickMark val="none"/>' +
      '<c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
      axisLineXml() +
      '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
      '<c:crossAx val="' + catAxisId + '"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>' +
      '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>' +
      '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
      '</c:legend>' +
      '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }

  function drawingXml(index){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<xdr:oneCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff>' +
      '<xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="9000000" cy="4000000"/>' +
      '<xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (index + 2) + '" name="Chart ' + index + '"/>' +
      '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>' +
      '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
  }

  function stylesXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="10"/><name val="Arial"/></font>' +
      '<font><b/><sz val="10"/><name val="Arial"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border/><border><left style="thin"><color rgb="FFB7C9D6"/></left>' +
      '<right style="thin"><color rgb="FFB7C9D6"/></right><top style="thin"><color rgb="FFB7C9D6"/></top>' +
      '<bottom style="thin"><color rgb="FFB7C9D6"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function workbookFiles(rows, options){
    const sorted = sortRows(rows);
    const specs = [
      { name:'Weight', title:'Weight(kg)', key:'weight', seriesName:'weight', valueFormat:'0.00' },
      { name:'Temp', title:'Temp(°C)', key:'temperature', seriesName:'temp', valueFormat:'0.0' },
      { name:'Humidity', title:'Hum(%)', key:'humidity', seriesName:'humidity', valueFormat:'0.0' },
    ];
    const buildOptions = options && typeof options === 'object' ? options : {};
    const files = new Map();
    const sheetOverrides = specs.map(function(_, index){
      return '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join('');
    const drawingOverrides = specs.map(function(_, index){
      return '<Override PartName="/xl/drawings/drawing' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    }).join('');
    const chartOverrides = specs.map(function(_, index){
      return '<Override PartName="/xl/charts/chart' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
    }).join('');
    files.set('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheetOverrides + drawingOverrides + chartOverrides + '</Types>');
    files.set('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    files.set('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      specs.map(function(spec, index){
        return '<sheet name="' + spec.name + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>';
      }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    files.set('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      specs.map(function(_, index){
        return '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');
    files.set('xl/styles.xml', stylesXml());
    specs.forEach(function(spec, index){
      const number = index + 1;
      const chartData = chartDataFor(sorted, spec.key, buildOptions);
      files.set('xl/worksheets/sheet' + number + '.xml', worksheetXml(spec.name, spec.title, spec.key, sorted, index, chartData));
      files.set('xl/worksheets/_rels/sheet' + number + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + number + '.xml"/>' +
        '</Relationships>');
      files.set('xl/drawings/drawing' + number + '.xml', drawingXml(index));
      files.set('xl/drawings/_rels/drawing' + number + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + number + '.xml"/>' +
        '</Relationships>');
      files.set('xl/charts/chart' + number + '.xml', chartXml(spec.name, spec.title, chartData, index, spec, buildOptions));
    });
    return files;
  }

  function crc32(bytes){
    let crc = 0xffffffff;
    for(let index = 0; index < bytes.length; index += 1){
      crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(view, offset, value){ view.setUint16(offset, value, true); }
  function writeUint32(view, offset, value){ view.setUint32(offset, value, true); }

  function zipFiles(files){
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    files.forEach(function(content, name){
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0x0800);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, 0);
      writeUint16(localView, 12, 0x21);
      writeUint32(localView, 14, checksum);
      writeUint32(localView, 18, data.length);
      writeUint32(localView, 22, data.length);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0x0800);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, 0);
      writeUint16(centralView, 14, 0x21);
      writeUint32(centralView, 16, checksum);
      writeUint32(centralView, 20, data.length);
      writeUint32(centralView, 24, data.length);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    });
    const centralSize = centralParts.reduce(function(sum, part){ return sum + part.length; }, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, files.size);
    writeUint16(endView, 10, files.size);
    writeUint32(endView, 12, centralSize);
    writeUint32(endView, 16, offset);
    writeUint16(endView, 20, 0);
    const parts = localParts.concat(centralParts, [end]);
    const total = parts.reduce(function(sum, part){ return sum + part.length; }, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    parts.forEach(function(part){
      output.set(part, cursor);
      cursor += part.length;
    });
    return output;
  }

  function build(rows, options){
    return new Blob([zipFiles(workbookFiles(rows, options))], {
      type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  global.BSF_REPORT_XLSX = Object.freeze({
    build: build,
    workbookFiles: workbookFiles,
  });
})(window);
