import SwiftUI

struct DetailView: View {
    let melding: Melding
    @Environment(\.dismiss) private var dismiss

    // JSON netjes inspringen; anders de tekst zoals hij binnenkwam
    private var ruwMooi: String {
        guard let ruw = melding.ruw, !ruw.isEmpty else { return "" }
        if let data = ruw.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data),
           let mooi = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]) {
            return String(decoding: mooi, as: UTF8.self)
        }
        return ruw
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    BronIcoon(bron: melding.bron, maat: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(melding.bron).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                        Text(melding.datum, format: .dateTime.weekday(.wide).day().month().hour().minute())
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if melding.isHoog {
                        Text("Hoog").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.red.opacity(0.15), in: Capsule()).foregroundStyle(.red)
                    }
                }
                Text(melding.titel).font(.title3.weight(.semibold))
                if !melding.tekst.isEmpty {
                    Text(melding.tekst).textSelection(.enabled)
                }
                if let link = melding.link {
                    Link(destination: link) {
                        Label(link.host() ?? link.absoluteString, systemImage: "arrow.up.right.square")
                    }
                }
            }

            if !ruwMooi.isEmpty {
                Section {
                    ScrollView(.horizontal) {
                        Text(ruwMooi)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .padding(.vertical, 4)
                    }
                } header: {
                    HStack {
                        Text("Ontvangen gegevens")
                        Spacer()
                        Button("Kopieer") { UIPasteboard.general.string = ruwMooi }
                            .font(.caption.weight(.semibold))
                            .textCase(nil)
                    }
                } footer: {
                    if let soort = melding.soort, !soort.isEmpty { Text(soort) }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ShareLink(item: [melding.titel, melding.tekst].filter { !$0.isEmpty }.joined(separator: "\n"))
                    Button("Verwijder", systemImage: "trash", role: .destructive) {
                        Task { await Store.shared.verwijder([melding.id]) }
                        dismiss()
                    }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .task { await Store.shared.markeerGelezen([melding.id]) }
    }
}
