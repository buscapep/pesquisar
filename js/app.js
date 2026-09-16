"use strict";

let pepData = [];
let relacionadosData = [];

// ============================================================
// ELEMENTOS
// ============================================================

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");

const resultsGrid = document.getElementById("resultsGrid");
const resultsCount = document.getElementById("resultsCount");
const counterBadge = document.getElementById("counterBadge");

const resultsHeading = document.getElementById("resultsHeading");
const resultsSub = document.getElementById("resultsSub");

const loadingState = document.getElementById("loadingState");


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    configurarEventos();
    carregarBasesDados();
});


// ============================================================
// EVENTOS
// ============================================================

function configurarEventos() {

    if (searchBtn) {
        searchBtn.addEventListener("click", executarBusca);
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", resetarBusca);
    }

    if (searchInput) {

        searchInput.addEventListener("keydown", (event) => {

            if (event.key === "Enter") {
                event.preventDefault();
                executarBusca();
            }

        });

        searchInput.addEventListener("input", () => {

            if (clearBtn) {
                clearBtn.style.display =
                    searchInput.value.trim() ? "flex" : "none";
            }

        });

    }
}


// ============================================================
// CARREGAMENTO DOS JSON
// ============================================================

async function carregarBasesDados() {
    
    mostrarLoading(true);
    
    try {
        const pepArquivos = [
            "json/pep_1.json",
            "json/pep_2.json",
            "json/pep_3.json",
            "json/pep_4.json"
        ];

        const [
            ...respostas
        ] = await Promise.all([
            ...pepArquivos.map(arquivo => fetch(arquivo)), 
            fetch("json/relacionados.json")
        ]);

        const pepResponses = respostas.slice(0, 4);
        
        const relacionadosResponse = respostas[4];
        
        for (let i = 0; i < pepResponses.length; i++) { 
            if (!pepResponses[i].ok) { 
                throw new Error(
                    `Não foi possível carregar ${pepArquivos[i]} (${pepResponses[i].status})`
                ); 
            } 
        }

        if (!relacionadosResponse.ok) { 
            throw new Error(
                `Não foi possível carregar relacionados.json (${relacionadosResponse.status})`
            ); 
        }
        
        const pepJsons = await Promise.all(
            pepResponses.map(response => response.json())
        );
        
        const relacionadosJson = await relacionadosResponse.json();

        for (let i = 0; i < pepJsons.length; i++) { 
            if (!Array.isArray(pepJsons[i])) { 
                throw new Error(
                    `${pepArquivos[i]} não contém uma lista.`
                ); 
            } 
        }

        if (!Array.isArray(relacionadosJson)) { 
            throw new Error(
                "relacionados.json não contém uma lista."
            ); 
        }

        pepData = pepJsons.flat();
        relacionadosData = relacionadosJson;
    
    } catch (error) {

        console.error("Erro ao carregar as bases:", error);

        pepData = [];
        relacionadosData = [];

        exibirErroCarregamento(error);

    } finally {
        mostrarLoading(false);
    }
}


// ============================================================
// BUSCA PRINCIPAL
// ============================================================

function executarBusca() {

    if (!searchInput) return;

    const consultaOriginal = searchInput.value.trim();

    if (!consultaOriginal) {
        resetarBusca();
        return;
    }

    mostrarLoading(true);

    // Pequeno delay apenas para manter feedback visual
    setTimeout(() => {

        try {

            const consultaTexto = normalizarTexto(consultaOriginal);
            const consultaCpf = normalizarCpf(consultaOriginal);

            // ----------------------------------------------------
            // 1. PROCURA DIRETAMENTE NA BASE DE PEP
            // ----------------------------------------------------

            const pepsEncontrados = pepData.filter((pep) => {

                const nome = normalizarTexto(pep.NOME_TITULAR);
                const cpf = normalizarCpf(pep.CPF_TITULAR);

                const encontrouNome =
                    consultaTexto.length > 0 &&
                    nome.includes(consultaTexto);

                const encontrouCpf =
                    consultaCpf.length > 0 &&
                    cpf === consultaCpf;

                return encontrouNome || encontrouCpf;
            });


            // ----------------------------------------------------
            // 2. PROCURA NA BASE DE RELACIONADOS
            // ----------------------------------------------------

            const relacionadosEncontrados = relacionadosData.filter(
                (relacionado) => {

                    const nome = normalizarTexto(relacionado.Nome);

                    const cpf = normalizarCpf(relacionado.CPF_CNPJ);

                    const encontrouNome =
                        consultaTexto.length > 0 &&
                        nome.includes(consultaTexto);

                    const encontrouCpf =
                        consultaCpf.length > 0 &&
                        cpf === consultaCpf;

                    return encontrouNome || encontrouCpf;
                }
            );


            // ----------------------------------------------------
            // 3. SE ENCONTROU UM RELACIONADO,
            //    LOCALIZA O PEP CORRESPONDENTE
            // ----------------------------------------------------

            const cpfsDosTitulares = new Set();

            relacionadosEncontrados.forEach((relacionado) => {

                const cpfTitular =
                    normalizarCpf(relacionado.CPF_TITULAR);

                if (cpfTitular) {
                    cpfsDosTitulares.add(cpfTitular);
                }

            });


            const pepsDosRelacionados = pepData.filter((pep) => {

                const cpfPep =
                    normalizarCpf(pep.CPF_TITULAR);

                return cpfsDosTitulares.has(cpfPep);

            });


            // ----------------------------------------------------
            // 4. JUNTA OS RESULTADOS
            // ----------------------------------------------------

            const todosOsPeps = [
                ...pepsEncontrados,
                ...pepsDosRelacionados
            ];

            const pepsUnicos = removerDuplicados(
                todosOsPeps,
                (pep) => normalizarCpf(pep.CPF_TITULAR)
            );


            // ----------------------------------------------------
            // 5. RENDERIZA
            // ----------------------------------------------------

            renderizarResultados(
                pepsUnicos,
                consultaOriginal,
                relacionadosEncontrados
            );

        } catch (error) {

            console.error("Erro durante a busca:", error);

            exibirErroBusca(error);

        } finally {

            mostrarLoading(false);

        }

    }, 150);
}


// ============================================================
// RENDERIZAÇÃO DOS RESULTADOS
// ============================================================

function renderizarResultados(
    peps,
    consulta,
    relacionadosEncontrados = []
) {

    if (!resultsGrid) return;

    resultsGrid.innerHTML = "";

    atualizarContador(peps.length);

    document.getElementById("results-section").style.visibility = "visible";


    // ----------------------------------------------------------
    // NENHUM RESULTADO
    // ----------------------------------------------------------

    if (peps.length === 0) {

        if (resultsHeading) {
            resultsHeading.textContent = "Nenhum registro encontrado";
        }

        if (resultsSub) {
            resultsSub.textContent =
                `Não encontramos correspondências para "${consulta}".`;
        }

        resultsGrid.appendChild(
            criarEstadoVazio(
                "Nenhum registro encontrado",
                `Não encontramos correspondências para "${consulta}".`
            )
        );

        const resultsSection = document.querySelector(".results-section");

        if (resultsSection) {

            resultsSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        }

        return;
    }


    // ----------------------------------------------------------
    // CABEÇALHO
    // ----------------------------------------------------------

    if (resultsHeading) {
        resultsHeading.textContent =
            peps.length === 1
                ? "1 registro encontrado"
                : `${peps.length} registros encontrados`;
    }

    if (resultsSub) {

        resultsSub.textContent =
            `Resultados para "${consulta}".`;
    }


    // ----------------------------------------------------------
    // CARDS
    // ----------------------------------------------------------

    peps.forEach((pep) => {

        const card = criarCardPep(
            pep,
            relacionadosEncontrados
        );

        resultsGrid.appendChild(card);

    });

    setTimeout(() => {

        const resultsSection =
            document.querySelector(".results-section");

        if (resultsSection) {

            resultsSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        }

    }, 100);


}


// ============================================================
// CARD DO PEP
// ============================================================

function criarCardPep(pep, relacionadosEncontrados) {

    const card = document.createElement("article");
    card.className = "pep-card";


    // ----------------------------------------------------------
    // CABEÇALHO
    // ----------------------------------------------------------

    const header = document.createElement("div");
    header.className = "pep-card-header";

    const nome = document.createElement("h3");
    nome.className = "pep-name";
    nome.textContent =
        pep.NOME_TITULAR || "Nome não informado";

    const status = document.createElement("span");
    status.className = `pep-status ${String(pep.ativo) === "1" ? "active" : "carencia"
        }`;

    status.textContent =
        String(pep.ativo) === "1"
            ? "Registro ativo"
            : "Período de acompanhamento";

    header.appendChild(nome);
    header.appendChild(status);

    card.appendChild(header);


    // ----------------------------------------------------------
    // CPF
    // ----------------------------------------------------------

    const cpf = criarInfoItem(
        "CPF",
        formatarCpfOuCnpj(pep.CPF_TITULAR)
    );

    card.appendChild(cpf);


    // ----------------------------------------------------------
    // FUNÇÃO
    // ----------------------------------------------------------

    const funcao = criarInfoItem(
        "Função",
        pep["Descrição_Função"] || "Não informado"
    );

    card.appendChild(funcao);


    // ----------------------------------------------------------
    // ÓRGÃO
    // ----------------------------------------------------------

    const orgao = criarInfoItem(
        "Órgão",
        pep["Nome_Órgão"] || "Não informado"
    );

    card.appendChild(orgao);


    // ----------------------------------------------------------
    // LOCALIZAÇÃO
    // ----------------------------------------------------------

    const cidadeUf = montarLocalizacao(pep);

    const localizacao = criarInfoItem(
        "Localização",
        cidadeUf
    );

    card.appendChild(localizacao);


    // ----------------------------------------------------------
    // EXERCÍCIO
    // ----------------------------------------------------------

    const inicio = pep["Data_Início_Exercício"] || "Não informado";
    const fim = pep["Data_Fim_Exercício"] || "Não informado";

    const exercicio = criarInfoItem(
        "Período do exercício",
        `${inicio} até ${fim}`
    );

    card.appendChild(exercicio);


    // ----------------------------------------------------------
    // CARÊNCIA
    // ----------------------------------------------------------

    const carencia = criarInfoItem(
        "Fim da carência",
        pep["Data_Fim_Carência"] || "Não informado"
    );

    card.appendChild(carencia);


    // ----------------------------------------------------------
    // RELACIONADOS
    // ----------------------------------------------------------

    const cpfPep = normalizarCpf(pep.CPF_TITULAR);

    const relacionadosDoPep = relacionadosData.filter(
        (relacionado) => {

            return normalizarCpf(relacionado.CPF_TITULAR) === cpfPep;

        }
    );


    if (relacionadosDoPep.length > 0) {

        const relacionadosBox =
            criarRelacionados(relacionadosDoPep);

        card.appendChild(relacionadosBox);

    }


    // ----------------------------------------------------------
    // ATUALIZAÇÃO
    // ----------------------------------------------------------

    if (pep.DATA_ATUALIZACAO) {

        const atualizacao = document.createElement("div");
        atualizacao.className = "pep-update";

        atualizacao.textContent =
            `Base atualizada em ${pep.DATA_ATUALIZACAO}`;

        card.appendChild(atualizacao);
    }


    return card;
}


// ============================================================
// INFORMAÇÃO DO CARD
// ============================================================

function criarInfoItem(label, value) {

    const container = document.createElement("div");
    container.className = "info-item";

    const labelElement = document.createElement("span");
    labelElement.className = "info-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "info-value";
    valueElement.textContent =
        value || "Não informado";

    container.appendChild(labelElement);
    container.appendChild(valueElement);

    return container;
}


// ============================================================
// RELACIONADOS
// ============================================================

function criarRelacionados(relacionados) {

    const container = document.createElement("div");
    container.className = "related-section";

    const title = document.createElement("h4");
    title.textContent = "Relacionados";

    container.appendChild(title);


    relacionados.forEach((relacionado) => {

        const item = document.createElement("div");
        item.className = "related-item";


        const nome = document.createElement("strong");
        nome.textContent =
            relacionado.Nome || "Nome não informado";


        const relacionamento = document.createElement("span");
        relacionamento.textContent =
            relacionado.RELACIONAMENTO ||
            "Relacionamento não informado";


        const cpf = document.createElement("small");
        cpf.textContent =
            `${relacionado.CPF_CNPJ.length == 11 ? "CPF" : "CNPJ"}: ${formatarCpfOuCnpj(relacionado.CPF_CNPJ)}`;


        item.appendChild(nome);
        item.appendChild(relacionamento);
        item.appendChild(cpf);

        container.appendChild(item);

    });


    return container;
}


// ============================================================
// LOCALIZAÇÃO
// ============================================================

function montarLocalizacao(pep) {

    const cidade = pep.Cidade || "";
    const uf = pep.UF || "";

    const cidadeValida =
        cidade &&
        normalizarTexto(cidade) !== "nao informado";

    const ufValida =
        uf &&
        normalizarTexto(uf) !== "nao informado";

    if (cidadeValida && ufValida) {
        return `${cidade} / ${uf}`;
    }

    if (cidadeValida) {
        return cidade;
    }

    if (ufValida) {
        return uf;
    }

    return "Não informado";
}


// ============================================================
// ESTADO VAZIO
// ============================================================

function criarEstadoVazio(titulo, mensagem) {

    const box = document.createElement("div");
    box.className = "empty-box";

    const title = document.createElement("h3");
    title.textContent = titulo;

    const text = document.createElement("p");
    text.textContent = mensagem;

    box.appendChild(title);
    box.appendChild(text);

    return box;
}


// ============================================================
// CONTADOR
// ============================================================

function atualizarContador(total) {

    if (resultsCount) {
        resultsCount.textContent = total;
    }

    if (counterBadge) {
        counterBadge.textContent =
            total === 1
                ? "1 registro"
                : `${total} registros`;
    }
}


// ============================================================
// RESET
// ============================================================

function resetarBusca() {

    if (searchInput) {
        searchInput.value = "";
    }

    if (clearBtn) {
        clearBtn.style.display = "none";
    }

    if (resultsGrid) {
        resultsGrid.innerHTML = "";
    }

    if (resultsCount) {
        resultsCount.textContent = "0";
    }

    if (counterBadge) {
        counterBadge.textContent = "0 registros";
    }

    if (resultsHeading) {
        resultsHeading.textContent = "Resultados";
    }

    if (resultsSub) {
        resultsSub.textContent =
            "Pesquise por nome ou CPF para consultar os registros.";
    }
}


// ============================================================
// LOADING
// ============================================================

function mostrarLoading(mostrar) {

    if (!loadingState) return;

    loadingState.style.display =
        mostrar ? "flex" : "none";
}


// ============================================================
// ERROS
// ============================================================

function exibirErroCarregamento(error) {

    if (!resultsGrid) return;

    resultsGrid.innerHTML = "";

    const box = criarEstadoVazio(
        "Erro ao carregar os dados",
        "Não foi possível carregar as bases de dados."
    );

    resultsGrid.appendChild(box);

    if (resultsHeading) {
        resultsHeading.textContent =
            "Erro ao carregar os dados";
    }

    if (resultsSub) {
        resultsSub.textContent =
            "Verifique se os arquivos JSON estão disponíveis.";
    }
}


function exibirErroBusca(error) {

    if (!resultsGrid) return;

    resultsGrid.innerHTML = "";

    const box = criarEstadoVazio(
        "Erro durante a consulta",
        "Ocorreu um problema ao processar a pesquisa."
    );

    resultsGrid.appendChild(box);

    console.error(error);
}


// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizarTexto(valor) {

    if (valor === null || valor === undefined) {
        return "";
    }

    return String(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}


function normalizarCpf(valor) {

    if (valor === null || valor === undefined) {
        return "";
    }

    return String(valor)
        .replace(/\D/g, "");
}


// ============================================================
// FORMATAÇÃO CPF / CNPJ
// ============================================================

function formatarCpfOuCnpj(valor) {
    const documento = normalizarCpf(valor);

    if (documento.length === 11) {
        return `${documento.slice(0, 3)}.***.***-${documento.slice(9, 11)}`;
    }

    if (documento.length === 14) {
        return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }

    return valor || "Não informado";
}


// ============================================================
// DUPLICIDADES
// ============================================================

function removerDuplicados(array, chaveFn) {

    const vistos = new Set();

    return array.filter((item) => {

        const chave = chaveFn(item);

        if (!chave) {
            return true;
        }

        if (vistos.has(chave)) {
            return false;
        }

        vistos.add(chave);

        return true;
    });
}

// ============================================================
// ROLAGEM
// ============================================================
function rolarpara(selector) {
    const elemento = document.querySelector(selector);

    if (elemento) {
        const offset = 200;

        const posicao =
            elemento.getBoundingClientRect().top +
            window.scrollY -
            offset;

        window.scrollTo({
            top: posicao,
            behavior: "smooth"
        });
    }
}