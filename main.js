// importa os bibliotecas necessários
const serialport = require('serialport');
const express = require('express');
const mysql = require('mysql2');

// constantes para configurações
const SERIAL_BAUD_RATE = 9600;
const SERVIDOR_PORTA = 3300;

// habilita ou desabilita a inserção de dados no banco de dados
const HABILITAR_OPERACAO_INSERIR = true;

// variavel para acumular vazamento do sensor 1
let vazamentoTotalSensor01 = 0;
let vazamentoTotalSensor02 = 0;
let vazamentoTotalSensor03 = 0;
let dataInicio1;
let dataInicio2;
let dataInicio3;
let dataFim1;
let dataFim2;
let dataFim3;

// função para comunicação serial
const serial = async (
    valoresSensorGas01, valoresSensorGas02, valoresSensorGas03,
) => {

    // conexão com o banco de dados MySQL
    let poolBancoDados = mysql.createPool(
        {
            host: 'localhost',
            user: 'user_insert',
            password: 'User@1234',
            database: 'pluma',
            port: 3307
        }
    ).promise();

    // lista as portas seriais disponíveis e procura pelo Arduino

    const portas = await serialport.SerialPort.list();
    const portaArduino = portas.find((porta) => porta.vendorId == 2341 && porta.productId == 43);
    if (!portaArduino) {
        throw new Error('O arduino não foi encontrado em nenhuma porta serial');
    }

    // const portaArduino = {
    //     path: 'COM5'
    // };

    // configura a porta serial com o baud rate especificado
    const arduino = new serialport.SerialPort(
        {
            path: portaArduino.path,
            baudRate: SERIAL_BAUD_RATE
        }
    );

    // evento quando a porta serial é aberta
    arduino.on('open', () => {
        console.log(`A leitura do arduino foi iniciada na porta ${portaArduino.path} utilizando Baud Rate de ${SERIAL_BAUD_RATE}`);
    });

    // processa os dados recebidos do Arduino
    arduino.pipe(new serialport.ReadlineParser({ delimiter: '\r\n' })).on('data', async (data) => {
        console.log(data);
        const valores = [data];
        const sensorGas01 = parseFloat(valores[0]);
        let sensorGas02 = 0;
        let sensorGas03 = 0;
        if (sensorGas01 > 0) {
            sensorGas02 = sensorGas01 + 300;
            sensorGas03 = sensorGas01 + 130;
        }
         
        // armazena os valores dos sensores nos arrays correspondentes
        valoresSensorGas01.push(sensorGas01);
        valoresSensorGas02.push(sensorGas02);
        valoresSensorGas03.push(sensorGas03);
        
        // insere os dados no banco de dados (se habilitado)
        if (HABILITAR_OPERACAO_INSERIR) {

            // este insert irá inserir os dados na tabela "medida"
            // Sensor id 1
            await poolBancoDados.execute(
                'INSERT INTO medicao (indiceGas, fkSensor) VALUES (?,?)',
                [sensorGas01, 1]
            );

            // Sensor id 2
            await poolBancoDados.execute(
                'INSERT INTO medicao (indiceGas, fkSensor) VALUES (?,?)',
                [sensorGas02, 2]
            );


            // sensor id 3
            await poolBancoDados.execute(
                'INSERT INTO medicao (indiceGas, fkSensor) VALUES (?,?)',
                [sensorGas03, 3]
            );
            
            console.log("valores inseridos no banco - Sensor 01: ", sensorGas01);
            console.log("valores inseridos no banco - Sensor 02: ", sensorGas02);
            console.log("valores inseridos no banco - Sensor 03: ", sensorGas03);

            // gravar vazamento total por sensor\
            // vazamento sensor 1
            if (sensorGas01 > 0) {
                if (vazamentoTotalSensor01 == 0) {
                    dataInicio1 = new Date();    
                }
                vazamentoTotalSensor01 += sensorGas01;
            } else if (vazamentoTotalSensor01 > 0) {
                dataFim1 = new Date();
                await poolBancoDados.execute(
                    'INSERT INTO vazamento (vazamentoTotal, fkSensor, dataInicio, dataFim) VALUES (?,?,?,?)',
                    [vazamentoTotalSensor01, 1, dataInicio1, dataFim1]
                );
                vazamentoTotalSensor01 = 0;
                console.log("Vazamento sensor 1 registrado");
            }

            
            // vazamento sensor 2
            if (sensorGas02 > 0) {
                if (vazamentoTotalSensor02 == 0) {
                    dataInicio2 = new Date();    
                }
                vazamentoTotalSensor02 += sensorGas02;
            } else if (vazamentoTotalSensor02 > 0) {
                dataFim2 = new Date();
                await poolBancoDados.execute(
                    'INSERT INTO vazamento (vazamentoTotal, fkSensor, dataInicio, dataFim) VALUES (?,?,?,?)',
                    [vazamentoTotalSensor02, 2, dataInicio2, dataFim2]
                );
                vazamentoTotalSensor02 = 0;
                console.log("Vazamento sensor 2 registrado");
            }

            // vazamento sensor 3
            if (sensorGas03 > 0) {
                if (vazamentoTotalSensor03 == 0) {
                    dataInicio3 = new Date();    
                }
                vazamentoTotalSensor03 += sensorGas03;
            } else if (vazamentoTotalSensor03 > 0) {
                dataFim3 = new Date();
                await poolBancoDados.execute(
                    'INSERT INTO vazamento (vazamentoTotal, fkSensor, dataInicio, dataFim) VALUES (?,?,?,?)',
                    [vazamentoTotalSensor03, 3, dataInicio3, dataFim3]
                );
                vazamentoTotalSensor03 = 0;
                console.log("Vazamento sensor 3 registrado");
            }

        }

    });

    // evento para lidar com erros na comunicação serial
    arduino.on('error', (mensagem) => {
        console.error(`Erro no arduino (Mensagem: ${mensagem}`)
    });
}

// função para criar e configurar o servidor web
const servidor = (
    valoresSensorGas01, valoresSensorGas02, valoresSensorGas03
) => {
    const app = express();

    // configurações de requisição e resposta
    app.use((request, response, next) => {
        response.header('Access-Control-Allow-Origin', '*');
        response.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
        next();
    });

    // inicia o servidor na porta especificada
    app.listen(SERVIDOR_PORTA, () => {
        console.log(`API executada com sucesso na porta ${SERVIDOR_PORTA}`);
    });

    // define os endpoints da API para cada tipo de sensor
    app.get('/sensores/sensorGas01', (_, response) => {
        return response.json(valoresSensorGas01);
    });

    app.get('/sensores/sensorGas02', (_, response) => {
        return response.json(valoresSensorGas02);
    });

    app.get('/sensores/sensorGas03', (_, response) => {
        return response.json(valoresSensorGas03);
    });
}

// função principal assíncrona para iniciar a comunicação serial e o servidor web
(async () => {
    // arrays para armazenar os valores dos sensores
    const valoresSensorGas01 = [];
    const valoresSensorGas02 = [];
    const valoresSensorGas03 = [];

    // inicia a comunicação serial
    await serial(
        valoresSensorGas01, valoresSensorGas02, valoresSensorGas03
    );

    // inicia o servidor web
    servidor(
        valoresSensorGas01, valoresSensorGas02, valoresSensorGas03
    );
})();
