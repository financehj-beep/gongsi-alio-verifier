// 글자 파일을 PDF로 바꾼다 (macOS Core Text 사용). 쪽 나눔은 줄바꿈 문자(\f)로 정한다.
// 글자 정보(ToUnicode)가 들어가서, 실제 한글 문서에서 저장한 PDF처럼 글자를 읽어 낼 수 있다.
// 실행: swift scripts/pdf-from-text.swift 입력.txt 출력.pdf
import CoreGraphics
import CoreText
import Foundation

let args = CommandLine.arguments
guard args.count == 3, let source = try? String(contentsOfFile: args[1], encoding: .utf8) else {
    FileHandle.standardError.write("사용법: swift pdf-from-text.swift 입력.txt 출력.pdf\n".data(using: .utf8)!)
    exit(1)
}

var box = CGRect(x: 0, y: 0, width: 595, height: 842)  // A4
guard let context = CGContext(URL.init(fileURLWithPath: args[2]) as CFURL, mediaBox: &box, nil) else { exit(1) }

let font = CTFontCreateWithName("Apple SD Gothic Neo" as CFString, 12, nil)
let attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): font]

for page in source.components(separatedBy: "\u{0C}") {
    context.beginPDFPage(nil)
    var y: CGFloat = 780
    for line in page.components(separatedBy: "\n") {
        if !line.isEmpty {
            let ctLine = CTLineCreateWithAttributedString(NSAttributedString(string: line, attributes: attributes))
            context.textPosition = CGPoint(x: 56, y: y)
            CTLineDraw(ctLine, context)
        }
        y -= 22
    }
    context.endPDFPage()
}
context.closePDF()
